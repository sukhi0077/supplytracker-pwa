// src/repositories/KsefJobRepository.js
// Reads the KSeF fetch-run history (ksef_fetch_jobs). Resilient: if the table
// isn't present yet, returns [] instead of breaking the page.
import { supabase, withTimeout, unwrap } from "../supabase.js";

export class KsefJobRepository {
  static async getRecent({ limit = 25 } = {}) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("ksef_fetch_jobs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(limit),
        15000,
        "Loading KSeF jobs",
      );
      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  }

  // Call the Worker. Auth uses the signed-in admin's Supabase session; the KSeF
  // NIP + token + environment are sent in the body (the "enter NIP + key, fetch"
  // flow). `path` is /run/ksef by default, or /auth-test for the login check.
  static async runFetch({ workerUrl, from, to, updateExisting, nip, token, environment, path = "/run/ksef" }) {
    const url = new URL(path, workerUrl);
    if (from) url.searchParams.set("from", from);
    if (to) url.searchParams.set("to", to);
    if (updateExisting) url.searchParams.set("update", "1");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const headers = { "content-type": "application/json" };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

    const resp = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ nip, token, environment }),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`Worker ${resp.status}: ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
}
