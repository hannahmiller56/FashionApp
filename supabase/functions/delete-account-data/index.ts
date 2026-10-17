import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { createAdminClient, createUserClient } from '../_shared/clients.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

async function removeBucketPrefix(adminClient: ReturnType<typeof createAdminClient>, bucket: string, prefix: string) {
  const { data: files, error: listError } = await adminClient.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' }
  });

  if (listError || !files || files.length === 0) {
    return;
  }

  const paths = files.map((file) => `${prefix}/${file.name}`);
  await adminClient.storage.from(bucket).remove(paths);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const userClient = createUserClient(req.headers.get('Authorization'));
  const adminClient = createAdminClient();

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse(401, { error: `Unauthorized: ${userError?.message || 'missing user in access token'}` });
  }

  try {
    const userId = user.id;

    await userClient.from('saved_looks').delete().eq('user_id', userId);
    await userClient.from('generation_results').delete().eq('user_id', userId);
    await userClient.from('generation_jobs').delete().eq('user_id', userId);
    await userClient.from('closet_items').delete().eq('user_id', userId);
    await userClient.from('usage_events').delete().eq('user_id', userId);

    const generatedBucket = Deno.env.get('GENERATED_LOOKS_BUCKET') || 'generated-looks';
    const closetBucket = Deno.env.get('CLOSET_BUCKET') || 'closet-items';

    await removeBucketPrefix(adminClient, generatedBucket, userId);
    await removeBucketPrefix(adminClient, closetBucket, userId);

    return jsonResponse(200, {
      success: true,
      message: 'User data removed from MVP tables and storage buckets.'
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown deletion error'
    });
  }
});
