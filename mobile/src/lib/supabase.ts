import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const supabaseProjectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseProjectUrl && supabasePublishableKey);

export const supabase = createClient(supabaseProjectUrl || 'https://placeholder.invalid', supabasePublishableKey || 'placeholder', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});
