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

  // Trigger the Cloudflare Worker's manual endpoint. The trigger secret is passed
  // in from the UI (kept in memory), never bundled. Returns the run summary.
  static async runFetch({ workerUrl, secret, from, to, updateExisting }) {
    const url = new URL("/run/ksef", workerUrl);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    if (updateExisting) url.searchParams.set("update", "1");
    const resp = await fetch(url.toString(), {
      method: "POST",
      headers: secret ? { "x-trigger-secret": secret } : {},
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
