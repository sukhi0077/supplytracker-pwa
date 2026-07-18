// Orchestration: fetch from KSeF -> parse -> upsert into Supabase.
// Idempotent — re-fetching a date range updates changed invoices and creates
// new ones. Mirrors core/ksef/service.py at a high level.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../lib/supabase.js";
import { KsefClient } from "./client.js";
import { parseFa, type ParsedInvoice } from "./parser.js";
import { fillLineGross } from "./money.js";
import { normalizeKsefName } from "./matching.js";

export interface FetchResult {
  found: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// Resolve (or create) a supplier from the parsed invoice, keyed by NIP then name.
async function resolveSupplier(db: SupabaseClient, inv: ParsedInvoice): Promise<string> {
  if (inv.supplier_nip) {
    const { data } = await db.from("suppliers").select("id").eq("nip", inv.supplier_nip).limit(1);
    if (data && data.length) return data[0].id as string;
  }
  const name = inv.supplier_name || `NIP ${inv.supplier_nip}` || "Unknown supplier";
  const { data: byName } = await db.from("suppliers").select("id").eq("name", name).limit(1);
  if (byName && byName.length) return byName[0].id as string;

  const { data: created, error } = await db
    .from("suppliers")
    .insert({ name, nip: inv.supplier_nip || "", ksef_name: inv.supplier_name || "" })
    .select("id")
    .single();
  if (error) throw new Error(`create supplier: ${error.message}`);
  return created.id as string;
}

// Build a lookup of normalized KSeF text -> { itemId, packSize } from mappings.
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
  opts: { updateExisting?: boolean } = {},
): Promise<FetchResult> {
  const res: FetchResult = { found: 0, created: 0, updated: 0, skipped: 0, errors: [] };

  // Job row (running).
  const { data: job } = await db
    .from("ksef_fetch_jobs")
    .insert({ status: "running", environment: env.KSEF_ENV, date_from: dateFrom, date_to: dateTo })
    .select("id")
    .single();
  const jobId = job?.id as string | undefined;

  const finish = async (status: string) => {
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
      })
      .eq("id", jobId);
  };

  try {
    // KSeF public key must be provided as an SPKI PEM secret (KSEF_PUBLIC_KEY_PEM).
    const publicKeyPem = (env as unknown as { KSEF_PUBLIC_KEY_PEM?: string }).KSEF_PUBLIC_KEY_PEM || "";
    const client = new KsefClient({
      baseUrl: env.KSEF_BASE_URL,
      nip: env.KSEF_NIP,
      token: env.KSEF_TOKEN,
      publicKeyPem,
    });
    await client.openSession();

    const refs = await client.queryInvoices(dateFrom, dateTo);
    res.found = refs.length;
    const mappings = await loadMappings(db);
    const writeStock = String(env.KSEF_WRITE_STOCK).toLowerCase() === "true";

    for (const ref of refs) {
      try {
        const xml = await client.fetchInvoiceXml(ref.ksefReference);
        const inv = parseFa(xml);
        const supplierId = await resolveSupplier(db, inv);

        // Exists already?
        const { data: existing } = await db
          .from("invoices")
          .select("id")
          .eq("supplier_id", supplierId)
          .eq("number", inv.number)
          .limit(1);
        if (existing && existing.length && !opts.updateExisting) {
          res.skipped++;
          continue;
        }

        const header = {
          supplier_id: supplierId,
          number: inv.number,
          ksef_reference: ref.ksefReference,
          issue_date: inv.issue_date,
          sale_date: inv.sale_date,
          due_date: inv.due_date,
          currency: inv.currency,
          net_total: inv.net_total,
          vat_total: inv.vat_total,
          gross_total: inv.gross_total,
          status: "fetched",
          updated_at: new Date().toISOString(),
        };

        let invoiceId: string;
        if (existing && existing.length) {
          invoiceId = existing[0].id as string;
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
            net_unit: l.net_unit,
            gross_unit: l.gross_unit,
            net_total: l.net_total,
            vat_amount: l.vat_amount,
            gross_total: grossTotal,
            vat_rate: l.vat_rate,
            discount: l.discount,
            pack_size: mapped?.pack ?? 1,
          };
        });
        if (lineRows.length) await db.from("invoice_lines").insert(lineRows);

        // Optional: mirror stock (purchase_in) for mapped lines.
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
        res.errors.push(`${ref.ksefReference}: ${(e as Error).message}`);
      }
    }

    await finish(res.errors.length ? "partial" : "success");
  } catch (e) {
    res.errors.push((e as Error).message);
    await finish("failed");
  }

  return res;
}
