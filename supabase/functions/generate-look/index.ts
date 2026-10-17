import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { createAdminClient, createUserClient } from '../_shared/clients.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { generateImageWithOpenAi } from '../_shared/openai.ts';

interface ClosetItemInput {
  id: string;
  category: string;
  color: string;
  style_tags?: string[];
  image_url: string;
}

const MAX_REFERENCE_IMAGES = 6;
const STORAGE_SIGNED_URL_TTL_SECONDS = 60 * 15;

function parseSupabaseStorageUrl(rawUrl: string): { bucket: string; objectPath: string } | null {
  if (!rawUrl.startsWith('supabase://')) return null;
  const withoutScheme = rawUrl.slice('supabase://'.length);
  const firstSlashIndex = withoutScheme.indexOf('/');
  if (firstSlashIndex <= 0 || firstSlashIndex >= withoutScheme.length - 1) return null;

  const bucket = withoutScheme.slice(0, firstSlashIndex);
  const objectPath = withoutScheme.slice(firstSlashIndex + 1);
  return { bucket, objectPath };
}

async function resolveClosetItemImageUrl(params: {
  adminClient: ReturnType<typeof createAdminClient>;
  imageUrl: string;
}): Promise<string> {
  const source = params.imageUrl.trim();
  if (!source) {
    throw new Error('Closet item is missing image URL');
  }

  if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('data:image/')) {
    return source;
  }

  const parsed = parseSupabaseStorageUrl(source);
  if (!parsed) {
    throw new Error(`Unsupported closet image URL format: ${source.slice(0, 40)}`);
  }

  const { data, error } = await params.adminClient
    .storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.objectPath, STORAGE_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to sign closet image URL: ${error?.message || 'missing signed URL'}`);
  }

  return data.signedUrl;
}

function sanitizeClosetItems(raw: unknown): Array<Pick<ClosetItemInput, 'id'>> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const id = String((entry as Record<string, unknown>).id || '').trim();
      if (!id) return null;
      return { id };
    })
    .filter((entry): entry is { id: string } => !!entry);
}

function sanitizeOptionalImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

function shouldRetryGeneration(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('timeout')
  );
}

async function generateWithRetry<T>(attempts: number, action: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetryGeneration(error)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError || 'Generation failed'));
}

function tokenizePrompt(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreItemRelevance(item: ClosetItemInput, promptTokens: Set<string>): number {
  let score = 0;

  const categoryTokens = item.category.split(/[^a-z0-9]+/g).filter(Boolean);
  for (const token of categoryTokens) {
    if (promptTokens.has(token)) score += 5;
  }

  const colorTokens = item.color.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
  for (const token of colorTokens) {
    if (promptTokens.has(token)) score += 7;
  }

  for (const styleTag of item.style_tags || []) {
    for (const token of styleTag.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean)) {
      if (promptTokens.has(token)) score += 2;
    }
  }

  return score;
}

function orderClosetItemsByPromptRelevance(items: ClosetItemInput[], prompt: string): ClosetItemInput[] {
  const promptTokens = new Set(tokenizePrompt(prompt));
  if (promptTokens.size === 0) return items;

  return items
    .map((item, index) => ({
      item,
      score: scoreItemRelevance(item, promptTokens),
      index
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const randomBytes = new Uint32Array(1);
  crypto.getRandomValues(randomBytes);
  return randomBytes[0] % maxExclusive;
}

function pickRandom<T>(items: T[]): T {
  return items[randomInt(items.length)];
}

function shuffleClosetItems(items: ClosetItemInput[]): ClosetItemInput[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizePromptForIntent(prompt: string): string {
  return prompt.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isSurprisePrompt(prompt: string): boolean {
  const normalized = normalizePromptForIntent(prompt);
  return (
    normalized === 'surpriseme' ||
    normalized === 'supriseme' ||
    normalized === 'random' ||
    normalized === 'anything'
  );
}

function buildSurpriseRequest(): string {
  const occasions = ['weekend brunch', 'office day', 'dinner out', 'city errands', 'coffee meetup'];
  const aesthetics = ['minimal chic', 'smart casual', 'streetwear clean', 'elevated basics', 'romantic modern'];
  const palettes = ['soft neutrals', 'monochrome with one accent', 'earth tones', 'muted pastels', 'black-and-white'];
  const silhouettes = ['balanced proportions', 'structured top + relaxed bottom', 'clean fitted layers', 'flowy with definition at the waist'];

  return [
    'Surprise styling request.',
    `Occasion: ${pickRandom(occasions)}.`,
    `Aesthetic: ${pickRandom(aesthetics)}.`,
    `Color direction: ${pickRandom(palettes)}.`,
    `Silhouette direction: ${pickRandom(silhouettes)}.`,
    'Make it coherent, wearable, and polished.'
  ].join(' ');
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function buildPrompt(input: {
  prompt: string;
  mode: 'closet_only' | 'allow_extras';
  subjectMode: 'mannequin' | 'personal';
  closetItems: ClosetItemInput[];
  primaryReferenceItem?: ClosetItemInput;
}) {
  const closetSummary = input.closetItems
    .map((item) => `- ${item.category}: ${item.color}; tags: ${(item.style_tags || []).join(', ') || 'none'}`)
    .join('\n');

  const modeLine =
    input.mode === 'closet_only'
      ? 'Use only closet items from the list below. Do not add non-closet garments.'
      : 'Prefer closet items from the list below. You may add extras only if needed and keep extras minimal.';

  const subjectLine =
    input.subjectMode === 'mannequin'
      ? 'Render on a clean studio female mannequin.'
      : 'Render on the provided personal look context while preserving realism and garment detail.';

  const primaryReferenceLine = input.primaryReferenceItem
    ? `Primary anchor garment is the FIRST reference image (${input.primaryReferenceItem.color} ${input.primaryReferenceItem.category}). Preserve it exactly and do not replace it.`
    : 'If reference garment images are provided, preserve those exact garments where possible.';

  return [
    'Create a photorealistic full-body fashion outfit image.',
    'Framing requirement: show the full person from top of head to below both shoes in one shot.',
    'Do not crop head, hair, legs, feet, or shoes; entire shoes must remain fully visible.',
    'Leave a small margin above the head and below the shoes so no garment details are cut off.',
    subjectLine,
    modeLine,
    primaryReferenceLine,
    'Prioritize exact garment color, pattern, silhouette, and visible texture cues where possible.',
    `User request: ${input.prompt}`,
    'Closet item inventory:',
    closetSummary || '- none provided'
  ].join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authHeader = req.headers.get('Authorization');
  const userClient = createUserClient(authHeader);
  const adminClient = createAdminClient();

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse(401, { error: `Unauthorized: ${userError?.message || 'missing user in access token'}` });
  }

  let jobId: string | null = null;
  const startedAt = Date.now();

  try {
    const body = await req.json();
    const prompt = String(body.prompt || '').trim();
    const mode = body.mode as 'closet_only' | 'allow_extras';
    const subjectMode = (body.subjectMode || 'mannequin') as 'mannequin' | 'personal';
    const subjectImageUrl = sanitizeOptionalImageUrl(body.subjectImageUrl);
    const requestedClosetItems = sanitizeClosetItems(body.closetItems);

    if (!prompt) {
      return jsonResponse(400, { error: 'Prompt is required' });
    }

    const surpriseMode = isSurprisePrompt(prompt);
    const effectivePrompt = surpriseMode ? buildSurpriseRequest() : prompt;

    if (mode !== 'closet_only' && mode !== 'allow_extras') {
      return jsonResponse(400, { error: 'Invalid generation mode' });
    }

    if (subjectMode === 'personal' && !subjectImageUrl) {
      return jsonResponse(400, {
        error: 'Personal mode requires a personal reference image. Upload your photo or switch to mannequin mode.'
      });
    }

    const requestedClosetIds = Array.from(new Set(requestedClosetItems.map((item) => item.id)));

    let closetItems: ClosetItemInput[] = [];
    if (requestedClosetIds.length > 0) {
      const { data: closetRows, error: closetReadError } = await userClient
        .from('closet_items')
        .select('id, category, color, style_tags, image_url')
        .eq('user_id', user.id)
        .in('id', requestedClosetIds);

      if (closetReadError) {
        throw closetReadError;
      }

      const closetMap = new Map((closetRows || []).map((item) => [String(item.id), item]));
      const missingIds = requestedClosetIds.filter((id) => !closetMap.has(id));

      if (missingIds.length > 0) {
        return jsonResponse(400, { error: `Closet items not found for current user: ${missingIds.length}` });
      }

      closetItems = requestedClosetIds
        .map((id) => closetMap.get(id))
        .filter(
          (
            item
          ): item is {
            id: string;
            category: string;
            color: string;
            style_tags: string[] | null;
            image_url: string;
          } => !!item
        )
        .map((item) => ({
          id: String(item.id),
          category: item.category,
          color: item.color,
          style_tags: item.style_tags || [],
          image_url: item.image_url
        }));
    }

    const { error: usageInsertError } = await userClient.from('usage_events').insert({
      user_id: user.id,
      event_type: 'generation_request',
      metadata: {
        mode,
        subjectMode
      }
    });

    if (usageInsertError) {
      throw usageInsertError;
    }

    const { data: createdJob, error: jobCreateError } = await userClient
      .from('generation_jobs')
      .insert({
        user_id: user.id,
        prompt_text: prompt,
        generation_mode: mode,
        subject_mode: subjectMode,
        model_name: 'gpt-image-1',
        status: 'running'
      })
      .select('id')
      .single();

    if (jobCreateError || !createdJob) {
      throw jobCreateError || new Error('Failed to create generation job');
    }

    jobId = createdJob.id;

    const rankedClosetItems = surpriseMode
      ? shuffleClosetItems(closetItems)
      : orderClosetItemsByPromptRelevance(closetItems, effectivePrompt);
    const referenceClosetItems = rankedClosetItems.slice(0, MAX_REFERENCE_IMAGES);

    const fullPrompt = buildPrompt({
      prompt: effectivePrompt,
      mode,
      subjectMode,
      closetItems: rankedClosetItems,
      primaryReferenceItem: referenceClosetItems[0]
    });

    const referenceImageUrls: string[] = [];
    for (const closetItem of referenceClosetItems) {
      const resolvedUrl = await resolveClosetItemImageUrl({
        adminClient,
        imageUrl: closetItem.image_url
      });
      referenceImageUrls.push(resolvedUrl);
    }

    if (subjectMode === 'personal' && subjectImageUrl) {
      const resolvedSubjectUrl = await resolveClosetItemImageUrl({
        adminClient,
        imageUrl: subjectImageUrl
      });
      referenceImageUrls.push(resolvedSubjectUrl);
    }

    if (closetItems.length > 0 && referenceImageUrls.length === 0) {
      throw new Error('Unable to resolve closet item images for image-conditioned generation');
    }

    const openAiResult = await generateWithRetry(2, () =>
      generateImageWithOpenAi({
        prompt: fullPrompt,
        quality: 'medium',
        size: '1024x1024',
        referenceImageUrls
      })
    );

    let imageUrl = openAiResult.url || '';
    const generatedBucket = Deno.env.get('GENERATED_LOOKS_BUCKET') || 'generated-looks';

    if (!imageUrl && openAiResult.b64Json) {
      const path = `${user.id}/${jobId}/result_${Date.now()}.png`;
      const bytes = decodeBase64ToBytes(openAiResult.b64Json);

      try {
        const { error: uploadError } = await adminClient.storage.from(generatedBucket).upload(path, bytes, {
          contentType: 'image/png',
          upsert: true
        });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = adminClient.storage.from(generatedBucket).getPublicUrl(path);
        imageUrl = publicUrlData.publicUrl;
      } catch {
        imageUrl = `data:image/png;base64,${openAiResult.b64Json}`;
      }
    }

    if (!imageUrl) {
      throw new Error('No image output from generation');
    }

    const recipeSimplified = {
      closet_item_ids: closetItems.map((item) => item.id),
      non_closet_notes: mode === 'allow_extras' ? ['Possible extras based on prompt constraints'] : []
    };

    const { data: resultRow, error: resultInsertError } = await userClient
      .from('generation_results')
      .insert({
        user_id: user.id,
        job_id: jobId,
        image_url: imageUrl,
        prompt_text: prompt,
        generation_mode: mode,
        recipe_simplified: recipeSimplified,
        model_version: 'gpt-image-1'
      })
      .select('*')
      .single();

    if (resultInsertError || !resultRow) {
      throw resultInsertError || new Error('Failed to persist generation result');
    }

    const latencyMs = Date.now() - startedAt;

    await userClient
      .from('generation_jobs')
      .update({
        status: 'succeeded',
        latency_ms: latencyMs
      })
      .eq('id', jobId)
      .eq('user_id', user.id);

    return jsonResponse(200, {
      results: [
        {
          id: resultRow.id,
          image_url: resultRow.image_url,
          prompt: resultRow.prompt_text,
          mode: resultRow.generation_mode,
          recipe_simplified: resultRow.recipe_simplified,
          model_version: resultRow.model_version,
          created_at: resultRow.created_at
        }
      ],
      latencyMs
    });
  } catch (error) {
    if (jobId) {
      await userClient
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error)
        })
        .eq('id', jobId)
        .eq('user_id', user.id);
    }

    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown generation error'
    });
  }
});
