import type { ClosetItem, GenerationMode, GenerationResult, SavedLook } from '../types';
import { isSupabaseConfigured, supabase, supabaseProjectUrl, supabasePublishableKey } from '../lib/supabase';
import { makeId } from '../lib/id';

const closetBucket = process.env.EXPO_PUBLIC_CLOSET_BUCKET || 'closet-items';
const imageUrlSignedTtlSeconds = 60 * 60;

function parseSupabaseStorageUrl(rawUrl: string): { bucket: string; path: string } | null {
  if (!rawUrl.startsWith('supabase://')) return null;
  const withoutScheme = rawUrl.slice('supabase://'.length);
  const firstSlashIndex = withoutScheme.indexOf('/');
  if (firstSlashIndex <= 0 || firstSlashIndex >= withoutScheme.length - 1) return null;

  return {
    bucket: withoutScheme.slice(0, firstSlashIndex),
    path: withoutScheme.slice(firstSlashIndex + 1)
  };
}

function inferContentType(uri: string): string {
  const normalized = uri.toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function uploadClosetImageIfNeeded(userId: string, imageUrl: string): Promise<string> {
  if (!imageUrl.startsWith('file://') && !imageUrl.startsWith('content://')) {
    return imageUrl;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error('Failed to read local image for upload.');
  }

  const contentType = inferContentType(imageUrl);
  const bytes = await response.arrayBuffer();
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/closet/${Date.now()}_${makeId('item')}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(closetBucket).upload(path, bytes, {
    contentType,
    upsert: false
  });

  if (uploadError) {
    throw new Error(`Failed to upload image to storage: ${uploadError.message}`);
  }

  return `supabase://${closetBucket}/${path}`;
}

async function getAccessTokenOrThrow(): Promise<string> {
  let {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshedData.session?.access_token) {
      session = refreshedData.session;
    }
  }

  if (!session?.access_token) {
    throw new Error('Not signed in. Open Settings and sign in (password or guest).');
  }

  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw new Error(`Session invalid. Please sign out and sign in again. (${userError.message})`);
  }

  return session.access_token;
}

async function getAccessTokenWithAnonymousFallback(): Promise<string> {
  let {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      throw new Error(`Unable to start guest session for account setup: ${error.message}`);
    }
    const refreshed = await supabase.auth.getSession();
    session = refreshed.data.session;
  }

  if (!session?.access_token) {
    throw new Error('Unable to create a session for account setup.');
  }

  return session.access_token;
}

async function callEdgeFunctionRaw(
  name: string,
  body: Record<string, unknown>,
  accessToken: string
): Promise<{ ok: boolean; status: number; body: unknown; rawText: string }> {
  if (!supabaseProjectUrl || !supabasePublishableKey) {
    throw new Error('Supabase project URL or publishable key is missing.');
  }

  const response = await fetch(`${supabaseProjectUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabasePublishableKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const rawText = await response.text();
  let parsed: unknown = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = rawText;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsed,
    rawText
  };
}

async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>, accessToken: string): Promise<T> {
  let tokenToUse = accessToken;
  let response = await callEdgeFunctionRaw(name, body, tokenToUse);

  if (
    !response.ok &&
    response.status === 401 &&
    response.rawText.toLowerCase().includes('invalid jwt')
  ) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) {
      tokenToUse = data.session.access_token;
      response = await callEdgeFunctionRaw(name, body, tokenToUse);
    }
  }

  if (!response.ok) {
    const parsed = response.body;
    const message =
      parsed && typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error?: unknown }).error)
        : response.rawText || `HTTP ${response.status}`;
    throw new Error(`Function ${name} failed (${response.status}): ${message}`);
  }

  return ((response.body || {}) as T);
}

export async function listClosetItems(): Promise<ClosetItem[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('closet_items')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as ClosetItem[];
}

export async function resolveImageUrlForDisplay(imageUrl: string): Promise<string> {
  if (!imageUrl) return '';
  if (!isSupabaseConfigured) return imageUrl;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('data:image/')) {
    return imageUrl;
  }

  const parsed = parseSupabaseStorageUrl(imageUrl);
  if (!parsed) {
    return imageUrl;
  }

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, imageUrlSignedTtlSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to load image preview: ${error?.message || 'missing signed URL'}`);
  }

  return data.signedUrl;
}

export async function upsertClosetItem(item: Omit<ClosetItem, 'id'> & { id?: string }): Promise<ClosetItem> {
  if (!isSupabaseConfigured) {
    return { ...item, id: item.id || makeId('closet') } as ClosetItem;
  }
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('You must be signed in to add closet items.');
  }

  const uploadedImageUrl = await uploadClosetImageIfNeeded(user.id, item.image_url);
  const payload = { ...item, image_url: uploadedImageUrl, user_id: user.id };
  const query = item.id
    ? supabase.from('closet_items').upsert(payload).select().single()
    : supabase.from('closet_items').insert(payload).select().single();
  const { data, error } = await query;
  if (error) throw error;
  return data as ClosetItem;
}

export async function requestGeneration(params: {
  prompt: string;
  mode: GenerationMode;
  closetItems: ClosetItem[];
  subjectMode: 'mannequin' | 'personal';
  subjectImageUrl?: string;
}): Promise<GenerationResult[]> {
  if (!isSupabaseConfigured) {
    return [
      {
        id: makeId('gen'),
        image_url: '',
        prompt: params.prompt,
        mode: params.mode,
        recipe_simplified: {
          closet_item_ids: params.closetItems.map((item) => item.id),
          non_closet_notes: params.mode === 'allow_extras' ? ['Fallback stylist extras may appear in full integration'] : []
        },
        model_version: 'gpt-image-1-mock',
        created_at: new Date().toISOString()
      }
    ];
  }

  const accessToken = await getAccessTokenOrThrow();
  const data = await invokeEdgeFunction<{ results?: GenerationResult[] }>('generate-look', params, accessToken);
  return (data?.results || []) as GenerationResult[];
}

export async function autoTagClosetItem(params: {
  closetItemId: string;
  detectCategory: boolean;
  detectColor: boolean;
  detectStyleTags: boolean;
}): Promise<ClosetItem | null> {
  if (!isSupabaseConfigured) return null;
  const accessToken = await getAccessTokenOrThrow();
  const data = await invokeEdgeFunction<{ closetItem?: ClosetItem }>(
    'tag-closet-item',
    {
      closetItemId: params.closetItemId,
      detectCategory: params.detectCategory,
      detectColor: params.detectColor,
      detectStyleTags: params.detectStyleTags
    },
    accessToken
  );
  return (data?.closetItem || null) as ClosetItem | null;
}

export async function createPasswordAccountForDemo(params: {
  email: string;
  password: string;
}): Promise<{ userId: string; email: string }> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.');
  }

  const accessToken = await getAccessTokenWithAnonymousFallback();
  const data = await invokeEdgeFunction<{ userId: string; email: string }>(
    'create-password-account',
    {
      email: params.email,
      password: params.password
    },
    accessToken
  );
  return {
    userId: data.userId,
    email: data.email
  };
}

export async function saveLook(payload: {
  result: GenerationResult;
  calendarDate?: string;
}): Promise<SavedLook> {
  if (!isSupabaseConfigured) {
    return {
      id: makeId('look'),
      image_url: payload.result.image_url,
      prompt_text: payload.result.prompt,
      recipe_simplified: payload.result.recipe_simplified,
      model_version: payload.result.model_version,
      calendar_date: payload.calendarDate,
      created_at: new Date().toISOString()
    };
  }

  const accessToken = await getAccessTokenOrThrow();
  const data = await invokeEdgeFunction<{ savedLook: SavedLook }>(
    'save-look',
    {
      result: payload.result,
      calendarDate: payload.calendarDate
    },
    accessToken
  );
  return data.savedLook as SavedLook;
}

export async function listSavedLooks(): Promise<SavedLook[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('saved_looks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as SavedLook[];
}
