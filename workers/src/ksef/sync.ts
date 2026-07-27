// Orchestration: fetch from KSeF -> parse -> upsert into Supabase.
//
// Free-tier aware: Cloudflare Workers allow only 50 subrequests per invocation.
// So we (a) batch the setup lookups into single queries, (b) skip invoices that
// are already imported (cheap, by ksef_reference), and (c) process only a capped
// number of NEW invoices per run — re-running (or the daily cron) imports the
// rest. Mirrors core/ksef/service.py at a high level.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../lib/supabase.js";
import { KsefClient } from "./client.js";
import { parseFa, type ParsedInvoice } from "./parser.js";
import { fillLineGross, round } from "./money.js";
import { normalizeKsefName } from "./matching.js";

// Max NEW invoices to fully fetch+write per invocation, to stay under the 50
// subrequest cap. Each new invoice costs ~3-4 subrequests.
const MAX_NEW_PER_RUN = 6;

// KSeF rate-limits invoice downloads, so space them out a little. Sleeping is
// wall-clock only — it costs no subrequests and no CPU budget.
const PACE_MS = 1500;

// If KSeF rate-limits us this many times in a row, stop early: the remaining
// invoices are reported as "left" and picked up by the next run.
const RATE_LIMIT_GIVE_UP = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchResult {
  found: number;
  created: number;
  updated: number;
  skipped: number;
  remaining: number;
  errors: string[];
  note?: string;
}

interface SupplierRec {
  nip: string;
  ksefName: string;
}
interface SupplierMaps {
  byNip: Map<string, string>; // nip -> id (merge key)
  byKey: Map<string, string>; // lower(name) AND lower(ksef_name) -> id
  byId: Map<string, SupplierRec>; // id -> mutable { nip, ksefName }
}

async function loadSuppliers(db: SupabaseClient): Promise<SupplierMaps> {
  const { data } = await db.from("suppliers").select("id, name, nip, ksef_name");
  const byNip = new Map<string, string>();
  const byKey = new Map<string, string>();
  const byId = new Map<string, SupplierRec>();
  for (const s of data || []) {
    const id = s.id as string;
    const nip = String(s.nip || "").trim();
    const ksefName = String(s.ksef_name || "").trim();
    if (nip) byNip.set(nip, id);
    if (s.name) byKey.set(String(s.name).toLowerCase(), id);
    if (ksefName) byKey.set(ksefName.toLowerCase(), id);
    byId.set(id, { nip, ksefName });
  }
  return { byNip, byKey, byId };
}

// Resolve the invoice's supplier, merging on NIP so a legal-name row and a
// curated row for the same company don't both accumulate:
//   1) same NIP  -> reuse that supplier.
//   2) same name / stored legal name -> reuse it; if it has a BLANK nip and the
//      invoice carries one, fill the nip (+ legal name) on that row.
//   3) otherwise create a new supplier.
// Only fills/creates trigger a write; matches are in-memory (free-tier friendly).
async function resolveSupplier(
  db: SupabaseClient,
  maps: SupplierMaps,
  inv: ParsedInvoice,
): Promise<string> {
  const nip = (inv.supplier_nip || "").trim();
  const legal = (inv.supplier_name || "").trim();

  // 1) merge on NIP
  if (nip && maps.byNip.has(nip)) return maps.byNip.get(nip)!;

  // 2) match on legal name (vs the supplier's name OR stored ksef_name)
  const key = legal.toLowerCase();
  const matchId = key ? maps.byKey.get(key) : undefined;
  if (matchId) {
    const rec = maps.byId.get(matchId);
    if (nip && rec && rec.nip.trim() === "") {
      const patch: Record<string, string> = { nip };
      if (rec.ksefName.trim() === "" && legal) patch.ksef_name = legal;
      await db.from("suppliers").update(patch).eq("id", matchId);
      rec.nip = nip;
      if (patch.ksef_name) rec.ksefName = legal;
      maps.byNip.set(nip, matchId);
    }
    return matchId;
  }

  // 3) create new
  const name = legal || (nip ? `NIP ${nip}` : "Unknown supplier");
  const { data: created, error } = await db
    .from("suppliers")
    .insert({ name, nip, ksef_name: legal })
    .select("id")
    .single();
  if (error) throw new Error(`create supplier: ${error.message}`);
  const id = created.id as string;
  if (nip) maps.byNip.set(nip, id);
  maps.byKey.set(name.toLowerCase(), id);
  if (legal) maps.byKey.set(legal.toLowerCase(), id);
  maps.byId.set(id, { nip, ksefName: legal });
  return id;
}

async function loadMappings(db: SupabaseClient): Promise<Map<string, { itemId: string; pack: number }>> {
  const { data } = await db.from("ksef_mappings").select("ksef_item_name,item_id,pack_size");
  const map = new Map<string, { itemId: string; pack: number }>();
  for (const m of data || []) {
    map.set(normalizeKsefName(m.ksef_item_name as string), {
      itemId: m.item_id as string,
      pack: Number(m.pack_size ?? 1),
    });
  }
  return map;
}

export async function runKsefFetch(
  env: Env,
  db: SupabaseClient,
  dateFrom: string,
  dateTo: string,
  opts: {
    updateExisting?: boolean;
    creds?: { nip: string; token: string };
    baseUrl?: string;
    environment?: string;
  } = {},
): Promise<FetchResult> {
  const res: FetchResult = { found: 0, created: 0, updated: 0, skipped: 0, remaining: 0, errors: [] };

  const { data: job } = await db
    .from("ksef_fetch_jobs")
    .insert({
      status: "running",
      environment: opts.environment || env.KSEF_ENV,
      date_from: dateFrom,
      date_to: dateTo,
    })
    .select("id")
    .single();
  const jobId = job?.id as string | undefined;

  const finish = async (status: string, note = "") => {
    if (!jobId) return;
    await db
      .from("ksef_fetch_jobs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        invoices_found: res.found,
        invoices_created: res.created,
        invoices_updated: res.updated,
        invoices_skipped: res.skipped,
        error_count: res.errors.length,
        error_log: res.errors.join("\n").slice(0, 8000),
        notes: note,
      })
      .eq("id", jobId);
  };

  try {
    const client = new KsefClient({
      baseUrl: opts.baseUrl || env.KSEF_BASE_URL,
      nip: opts.creds?.nip || env.KSEF_NIP,
      token: opts.creds?.token || env.KSEF_TOKEN,
      publicKeyPem: env.KSEF_PUBLIC_KEY_PEM || undefined,
    });
    await client.openSession();

    const refs = await client.queryInvoices(dateFrom, dateTo);
    res.found = refs.length;

    // Batch: which of these are already imported (by ksef_reference)?
    const refList = refs.map((r) => r.ksefReference);
    const existingMap = new Map<string, string>();
    // When re-importing we also need to know how stale each row is, so a
    // capped run can rotate through them instead of redoing the same ones.
    const staleness = new Map<string, number>();
    if (refList.length) {
      const { data: existing } = await db
        .from("invoices")
        .select("id, ksef_reference, updated_at")
        .in("ksef_reference", refList);
      for (const e of existing || []) {
        existingMap.set(e.ksef_reference as string, e.id as string);
        staleness.set(e.ksef_reference as string, Date.parse(String(e.updated_at || "")) || 0);
      }
    }

    const suppliers = await loadSuppliers(db);
    const mappings = await loadMappings(db);
    const writeStock = String(env.KSEF_WRITE_STOCK).toLowerCase() === "true";

    // Candidates = new invoices, or all when re-importing.
    const candidates = refs.filter(
      (r) => opts.updateExisting || !existingMap.has(r.ksefReference),
    );
    // Already-imported invoices we're not updating cost nothing here.
    res.skipped = refs.length - candidates.length;

    // Ordering matters because the run is capped. Never-imported invoices go
    // first (they're the whole point), then already-imported ones oldest-
    // updated first — so each re-run touches a DIFFERENT slice and the run
    // actually makes progress instead of rewriting the same 8 rows forever.
    candidates.sort((a, b) => {
      const sa = existingMap.has(a.ksefReference) ? staleness.get(a.ksefReference)! : -1;
      const sb = existingMap.has(b.ksefReference) ? staleness.get(b.ksefReference)! : -1;
      return sa - sb;
    });

    let processed = 0;
    let rateLimitStreak = 0;
    for (const ref of candidates) {
      if (processed >= MAX_NEW_PER_RUN || rateLimitStreak >= RATE_LIMIT_GIVE_UP) {
        res.remaining++;
        continue;
      }
      if (processed > 0) await sleep(PACE_MS);
      processed++;

      try {
        const xml = await client.fetchInvoiceXml(ref.ksefReference);
        rateLimitStreak = 0;
        const inv = parseFa(xml);
        const supplierId = await resolveSupplier(db, suppliers, inv);

        // Money is stored at 2dp — KSeF occasionally sends more. Quantities,
        // pack sizes and VAT rates keep whatever precision they arrived with.
        const r2 = (v: number | null | undefined) => round(v ?? null, 2);

        const header = {
          supplier_id: supplierId,
          number: inv.number,
          ksef_reference: ref.ksefReference,
          issue_date: inv.issue_date,
          sale_date: inv.sale_date,
          due_date: inv.due_date,
          currency: inv.currency,
          net_total: r2(inv.net_total),
          vat_total: r2(inv.vat_total),
          gross_total: r2(inv.gross_total),
          status: "fetched",
          updated_at: new Date().toISOString(),
        };

        const existingId = existingMap.get(ref.ksefReference);
        let invoiceId: string;
        if (existingId) {
          invoiceId = existingId;
          await db.from("invoices").update(header).eq("id", invoiceId);
          await db.from("invoice_lines").delete().eq("invoice_id", invoiceId);
          res.updated++;
        } else {
          const { data: ins, error } = await db.from("invoices").insert(header).select("id").single();
          if (error) throw new Error(error.message);
          invoiceId = ins.id as string;
          res.created++;
        }

        const lineRows = inv.lines.map((l) => {
          const [, grossTotal] = fillLineGross({
            netUnit: l.net_unit,
            grossUnit: l.gross_unit,
            netTotal: l.net_total,
            grossTotal: l.gross_total,
            vatRate: l.vat_rate,
            vatAmount: l.vat_amount,
            quantity: l.quantity,
          });
          const mapped = mappings.get(normalizeKsefName(l.ksef_item_name_raw));
          return {
            invoice_id: invoiceId,
            line_no: l.line_no,
            item_id: mapped?.itemId ?? null,
            ksef_item_name_raw: l.ksef_item_name_raw,
            quantity: l.quantity,
            unit: l.unit,
            net_unit: r2(l.net_unit),
            gross_unit: r2(l.gross_unit),
            net_total: r2(l.net_total),
            vat_amount: r2(l.vat_amount),
            gross_total: r2(grossTotal),
            vat_rate: l.vat_rate,
            discount: r2(l.discount),
            pack_size: mapped?.pack ?? 1,
          };
        });
        if (lineRows.length) await db.from("invoice_lines").insert(lineRows);

        if (writeStock) {
          const moves = lineRows
            .filter((r) => r.item_id)
            .map((r) => ({
              item_id: r.item_id,
              qty: Number(r.quantity) * Number(r.pack_size),
              kind: "purchase_in",
              invoice_id: invoiceId,
              happened_at: inv.issue_date,
              notes: `KSeF ${inv.number}`,
            }));
          if (moves.length) await db.from("stock_movements").insert(moves);
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (/-> (429|503)\b/.test(msg)) {
          // Rate-limited: not a real error — the invoice is untouched and the
          // next run will pick it up (never-imported ones sort first anyway).
          rateLimitStreak++;
          res.remaining++;
        } else {
          res.errors.push(`${ref.ksefReference}: ${msg}`);
        }
      }
    }

    const note =
      res.remaining > 0
        ? rateLimitStreak >= RATE_LIMIT_GIVE_UP
          ? `KSeF rate limit hit — ${res.remaining} left.`
          : opts.updateExisting && res.created === 0
            ? `All ${res.found} already imported — refreshed ${res.updated}; untick "Update existing" for new only.`
            : `${res.remaining} left (per-run cap).`
        : "";
    res.note = note;
    await finish(res.errors.length ? "partial" : "success", note);
  } catch (e) {
    res.errors.push((e as Error).message);
    await finish("failed");
  }

  return res;
}
