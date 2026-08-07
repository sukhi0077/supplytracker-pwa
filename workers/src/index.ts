// Worker entry: scheduled (cron) + a guarded HTTP endpoint for manual runs.
//
//   Cron "20 6 * * *" -> KSeF fetch (last few days)
//   Cron "40 6 * * *" -> wFirma status sync (last ~40 days)
//   POST /run/ksef?from=YYYY-MM-DD&to=YYYY-MM-DD   (header  x-trigger-secret)
//   POST /run/wfirma?from=...&to=...
import { db, type Env } from "./lib/supabase.js";
import { runKsefFetch } from "./ksef/sync.js";
import { runWfirmaSync } from "./wfirma/sync.js";
import { KsefClient } from "./ksef/client.js";
import { verifyAdmin } from "./lib/auth.js";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));

type FullEnv = Env & { TRIGGER_SECRET?: string };

// Map the UI's environment choice to a KSeF host; fall back to the configured one.
const KSEF_HOSTS: Record<string, string> = {
  test: "https://api-test.ksef.mf.gov.pl/api/v2",
  prod: "https://api.ksef.mf.gov.pl/api/v2",
};
const baseUrlFor = (env: Env, environment?: string) =>
  (environment && KSEF_HOSTS[environment]) || env.KSEF_BASE_URL;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-trigger-secret",
};
const jsonRes = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...CORS } });

export default {
  // --- Cron ---
  async scheduled(event: ScheduledController, env: FullEnv, ctx: ExecutionContext) {
    const client = db(env);
    // Log rather than swallow: a throw before the job row exists (bad Supabase
    // creds, for instance) would otherwise leave no trace anywhere — not in
    // ksef_fetch_jobs, not in the console. Visible via `wrangler tail`.
    const run = (label: string, p: Promise<unknown>) =>
      ctx.waitUntil(
        p.then(
          () => {},
          (e) => console.error(`[cron ${label}] ${(e as Error)?.stack || e}`),
        ),
      );

    if (event.cron === "40 6 * * *") {
      run("wfirma", runWfirmaSync(env, client, { dateFrom: daysAgo(40), dateTo: iso(new Date()) }));
    } else {
      // default / "20 6 * * *": KSeF fetch, last 48 hours.
      //
      // The KSeF query is date-granular (it spans whole days), so a 48-hour
      // window is "the day before yesterday through today". At 06:20 that
      // guarantees a full 48 hours of coverage and overlaps the previous run
      // by a day rather than risking a gap either side of midnight.
      //
      // updateExisting picks up corrections to invoices already imported.
      // Candidates are ordered new-first, so a re-import can never starve a
      // genuinely new invoice of the per-run budget.
      run("ksef", runKsefFetch(env, client, daysAgo(2), iso(new Date()), { updateExisting: true }));
    }
  },

  // --- HTTP endpoints for the PWA (and curl) ---
  // Auth: a signed-in admin's Supabase JWT (Authorization: Bearer …) OR the
  // x-trigger-secret header. Credentials (nip/token/environment) may be supplied
  // in the JSON body — that's the "enter NIP + key, fetch" flow; otherwise the
  // env secrets are used (cron).
  async fetch(req: Request, env: FullEnv): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    // Wrap everything so ANY error (e.g. missing SUPABASE_URL secret) still
    // returns CORS headers + a readable message, instead of an opaque crash that
    // the browser reports as a CORS failure.
    try {
    const url = new URL(req.url);
    const isAction =
      req.method === "POST" &&
      (url.pathname.startsWith("/run/") || url.pathname === "/auth-test");
    if (!isAction) {
      return new Response("SupplyTracker workers. POST /auth-test, /run/ksef, or /run/wfirma.", {
        status: 200,
        headers: CORS,
      });
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonRes(
        { error: "Worker missing secrets: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (wrangler secret put …)." },
        500,
      );
    }
    const client = db(env);

    // Authorize: trigger secret OR admin session.
    let authorized = false;
    if (env.TRIGGER_SECRET && req.headers.get("x-trigger-secret") === env.TRIGGER_SECRET) authorized = true;
    if (!authorized) {
      try {
        await verifyAdmin(req, env, client);
        authorized = true;
      } catch {
        authorized = false;
      }
    }
    if (!authorized) return jsonRes({ error: "Forbidden — sign in as an admin or send x-trigger-secret." }, 403);

    // Optional credentials + environment from the request body.
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const creds =
      body.nip && body.token ? { nip: String(body.nip), token: String(body.token) } : undefined;
    const environment = body.environment ? String(body.environment) : undefined;
    const baseUrl = baseUrlFor(env, environment);

    const from = url.searchParams.get("from") || daysAgo(7);
    const to = url.searchParams.get("to") || iso(new Date());

    try {
      // Isolated auth check — verifies KSeF login + token encryption only.
      if (url.pathname === "/auth-test") {
        const k = new KsefClient({
          baseUrl,
          nip: creds?.nip || env.KSEF_NIP,
          token: creds?.token || env.KSEF_TOKEN,
          publicKeyPem: env.KSEF_PUBLIC_KEY_PEM || undefined,
        });
        const s = await k.openSession();
        return jsonRes({ ok: true, gotAccessToken: !!s.accessToken });
      }

      if (url.pathname === "/run/ksef") {
        const r = await runKsefFetch(env, client, from, to, {
          updateExisting: url.searchParams.get("update") === "1",
          creds,
          environment,
          baseUrl,
        });
        return jsonRes(r);
      }
      if (url.pathname === "/run/wfirma") {
        const r = await runWfirmaSync(env, client, { dateFrom: from, dateTo: to });
        return jsonRes(r);
      }
      return jsonRes({ error: "Not found" }, 404);
    } catch (e) {
      return jsonRes({ error: (e as Error).message }, 500);
    }
    } catch (e) {
      return jsonRes({ error: `Worker error: ${(e as Error).message}` }, 500);
    }
  },
};
