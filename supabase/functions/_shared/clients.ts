import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey =
  Deno.env.get('FASHIONAPP_SUPABASE_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_PUBLISHABLE_DEFAULT_KEY') ||
  Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_DEFAULT_KEY');

if (!anonKey) {
  throw new Error('Missing Supabase publishable/anon key for Edge Function client initialization');
}

if (!serviceRoleKey) {
  throw new Error('Missing Supabase secret/service role key for Edge Function client initialization');
}

export function createUserClient(authHeader: string | null) {
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader || ''
      }
    }
  });
}

export function createAdminClient() {
  return createClient(supabaseUrl, serviceRoleKey);
}
