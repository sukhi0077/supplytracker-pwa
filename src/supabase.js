// src/supabase.js
// Single Supabase client for the whole app. Points at the SAME Supabase project
// as order-stock-pwa — both apps share one database.
//
// The URL + PUBLISHABLE key come from environment variables and are SAFE to ship
// in the frontend BECAUSE Row-Level Security is configured (see
// supabase/schema.sql). The publishable key can only do what RLS allows.
//
// NEVER put a secret key (sb_secret_... / service_role) in the frontend or git.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !publishableKey) {
  console.error(
    "[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. " +
      "Set them in .env (dev) or Cloudflare Pages env vars (prod).",
  );
}

export const supabase = createClient(
  url || "https://YOUR-PROJECT.supabase.co",
  publishableKey || "sb_publishable_xxx",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);

// Turn a Postgres timestamptz (ISO string) into the { seconds } shape used for
// display helpers, matching order-stock-pwa's convention.
export function toTs(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? { seconds: Math.floor(ms / 1000) } : null;
}

// Reject if a network call hangs, so the UI can show an error/retry instead of
// spinning forever.
export function withTimeout(promise, ms = 15000, label = "Request") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out. Check your connection.`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Unwrap a supabase-js result, throwing on error so callers can try/catch.
export function unwrap({ data, error }, label = "Request") {
  if (error) {
    const e = new Error(error.message || `${label} failed`);
    e.code = error.code;
    e.details = error.details;
    throw e;
  }
  return data;
}
