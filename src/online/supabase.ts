import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: { url: string; key: string; client: SupabaseClient } | null = null;

export function supabaseConfig(settingsUrl: string, settingsKey: string) {
  const url = settingsUrl.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
  const key = settingsKey.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';
  return { url, key, ok: Boolean(url && key) };
}

export function getSupabase(url: string, key: string): SupabaseClient {
  if (cached && cached.url === url && cached.key === key) return cached.client;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 40 } },
  });
  cached = { url, key, client };
  return client;
}
