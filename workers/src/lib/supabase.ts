// Service-role Supabase client for the Worker. The service-role key bypasses
// RLS — this is correct for a trusted backend job, and the key lives ONLY here
// as a Worker Secret (never in the browser).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  KSEF_BASE_URL: string;
  KSEF_ENV: string;
  KSEF_NIP: string;
  KSEF_TOKEN: string;
  KSEF_WRITE_STOCK: string;
  WFIRMA_LOGIN: string;
  WFIRMA_PASSWORD: string;
}

export function db(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
