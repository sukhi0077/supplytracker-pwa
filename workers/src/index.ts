// Worker entry: scheduled (cron) + a guarded HTTP endpoint for manual runs.
//
//   Cron "20 6 * * *" -> KSeF fetch (last few days)
//   Cron "40 6 * * *" -> wFirma status sync (last ~40 days)
//   POST /run/ksef?from=YYYY-MM-DD&to=YYYY-MM-DD   (header  x-trigger-secret)
//   POST /run/wfirma?from=...&to=...
import { db, type Env } from "./lib/supabase.js";
import { runKsefFetch } from "./ksef/sync.js";
import { runWfirmaSync } from "./wfirma/sync.js";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));

type FullEnv = Env & { TRIGGER_SECRET?: string };

export default {
  // --- Cron ---
  async scheduled(event: ScheduledController, env: FullEnv, ctx: ExecutionContext) {
    const client = db(env);
    if (event.cron === "40 6 * * *") {
      ctx.waitUntil(runWfirmaSync(env, client, { dateFrom: daysAgo(40), dateTo: iso(new Date()) }).then(() => {}));
    } else {
      // default / "20 6 * * *": KSeF fetch, last 4 days.
      ctx.waitUntil(runKsefFetch(env, client, daysAgo(4), iso(new Date())).then(() => {}));
    }
  },

  // --- Manual HTTP trigger (guarded by a shared secret) ---
  async fetch(req: Request, env: FullEnv): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== "POST" || !url.pathname.startsWith("/run/")) {
      return new Response("SupplyTracker workers. POST /run/ksef or /run/wfirma.", { status: 200 });
    }
    if (env.TRIGGER_SECRET && req.headers.get("x-trigger-secret") !== env.TRIGGER_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }
    const from = url.searchParams.get("from") || daysAgo(7);
    const to = url.searchParams.get("to") || iso(new Date());
    const client = db(env);

    try {
      if (url.pathname === "/run/ksef") {
        const r = await runKsefFetch(env, client, from, to, { updateExisting: url.searchParams.get("update") === "1" });
        return Response.json(r);
      }
      if (url.pathname === "/run/wfirma") {
        const r = await runWfirmaSync(env, client, { dateFrom: from, dateTo: to });
        return Response.json(r);
      }
      return new Response("Not found", { status: 404 });
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
  },
};
