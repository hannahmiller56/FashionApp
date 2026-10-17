import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { createAdminClient, createUserClient } from '../_shared/clients.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { autoTagClosetItemWithOpenAi } from '../_shared/openai.ts';

type ClosetCategory = 'top' | 'bottom' | 'dress' | 'outerwear' | 'shoes' | 'accessories';

const VALID_CATEGORIES: ClosetCategory[] = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessories'];
const STORAGE_SIGNED_URL_TTL_SECONDS = 60 * 10;

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

function sanitizeCategory(category: string, fallback: ClosetCategory): ClosetCategory {
  const normalized = category.trim().toLowerCase();
  return (VALID_CATEGORIES.find((value) => value === normalized) || fallback) as ClosetCategory;
}

function sanitizeColor(color: string, fallback: string): string {
  const normalized = color
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
}

function sanitizeStyleTags(tags: string[], fallback: string[]): string[] {
  const values = tags
    .map((tag) =>
      tag
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index)
    .slice(0, 4);

  return values.length > 0 ? values : fallback.slice(0, 4);
}

function sanitizeBooleanFlag(value: unknown, defaultValue = true): boolean {
  if (typeof value === 'boolean') return value;
  return defaultValue;
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

  try {
    const body = await req.json();
    const closetItemId = String(body.closetItemId || '').trim();
    const detectCategory = sanitizeBooleanFlag(body.detectCategory, true);
    const detectColor = sanitizeBooleanFlag(body.detectColor, true);
    const detectStyleTags = sanitizeBooleanFlag(body.detectStyleTags, true);

    if (!closetItemId) {
      return jsonResponse(400, { error: 'closetItemId is required' });
    }

    const { data: row, error: readError } = await userClient
      .from('closet_items')
      .select('id, user_id, image_url, category, color, style_tags')
      .eq('id', closetItemId)
      .eq('user_id', user.id)
      .single();

    if (readError || !row) {
      return jsonResponse(404, { error: 'Closet item not found for current user' });
    }

    if (!detectCategory && !detectColor && !detectStyleTags) {
      return jsonResponse(200, {
        closetItem: row,
        skipped: true
      });
    }

    const resolvedImageUrl = await resolveClosetItemImageUrl({
      adminClient,
      imageUrl: row.image_url
    });

    const autoTag = await autoTagClosetItemWithOpenAi({
      imageUrl: resolvedImageUrl,
      currentCategory: row.category,
      currentColor: row.color,
      currentStyleTags: row.style_tags || []
    });

    const category = detectCategory
      ? sanitizeCategory(autoTag.category, row.category as ClosetCategory)
      : (row.category as ClosetCategory);
    const color = detectColor
      ? sanitizeColor(autoTag.color, row.color || 'unknown')
      : (row.color || 'unknown');
    const styleTags = detectStyleTags
      ? sanitizeStyleTags(autoTag.style_tags || [], row.style_tags || [])
      : (row.style_tags || []);

    const { data: updated, error: updateError } = await userClient
      .from('closet_items')
      .update({
        category,
        color,
        style_tags: styleTags
      })
      .eq('id', row.id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      throw updateError || new Error('Failed to update closet item with auto-tags');
    }

    return jsonResponse(200, {
      closetItem: updated,
      model: Deno.env.get('OPENAI_AUTOTAG_MODEL') || 'gpt-4o-mini'
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown closet auto-tag error'
    });
  }
});
