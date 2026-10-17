import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { createAdminClient, createUserClient } from '../_shared/clients.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizePassword(value: unknown): string {
  return String(value || '');
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
    return jsonResponse(401, {
      error: `Unauthorized: ${userError?.message || 'missing user in access token'}`
    });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const password = normalizePassword(body.password);

    if (!email || !EMAIL_REGEX.test(email)) {
      return jsonResponse(400, { error: 'Valid email is required.' });
    }

    if (password.length < 6) {
      return jsonResponse(400, { error: 'Password must be at least 6 characters.' });
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (error) {
      return jsonResponse(409, { error: error.message });
    }

    return jsonResponse(200, {
      userId: data.user?.id || '',
      email: data.user?.email || email
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown account creation error'
    });
  }
});
