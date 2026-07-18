// Match wFirma expense documents to local invoices and mirror their payment
// status. Ported from core/wfirma/service.py.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../lib/supabase.js";
import { WfirmaClient } from "./client.js";

export interface SyncResult {
  expensesSeen: number;
  matched: number;
  updated: number;
  unmatchedLocal: number;
  errors: string[];
}

const normNumber = (s: unknown) => String(s ?? "").replace(/\s+/g, "").toUpperCase();
const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const pick = (rec: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (rec[k] !== undefined && rec[k] !== null && rec[k] !== "") return rec[k];
  return undefined;
};

// Return { wid, number, payment, remaining, booking }.
function derive(rec: Record<string, unknown>) {
  const wid = String(pick(rec, "id") ?? "");
  const number = String(pick(rec, "fullnumber", "number", "name") ?? "");
  const total = toNum(pick(rec, "total", "brutto", "value"));
  const paid = toNum(pick(rec, "alreadypaid", "paid"));
  let remaining = toNum(pick(rec, "remaining"));
  if (remaining === null && total !== null) remaining = total - (paid ?? 0);

  const state = String(pick(rec, "paymentstate", "payment_state") ?? "").toLowerCase();
  let payment = "";
  if (remaining !== null) {
    if (remaining <= 0) payment = "paid";
    else if (paid && paid > 0) payment = "partial";
    else payment = "unpaid";
  } else if (state) {
    payment = state.includes("paid") || state.includes("zap") ? "paid" : "unpaid";
  }
  const booking = String(pick(rec, "disposition", "register", "type", "status") ?? "").slice(0, 32);
  return { wid, number, payment, remaining, booking };
}

export async function runWfirmaSync(
  env: Env,
  db: SupabaseClient,
  opts: { dateFrom?: string; dateTo?: string } = {},
): Promise<SyncResult> {
  const res: SyncResult = { expensesSeen: 0, matched: 0, updated: 0, unmatchedLocal: 0, errors: [] };
  const client = new WfirmaClient({ login: env.WFIRMA_LOGIN, password: env.WFIRMA_PASSWORD });

  // Page through wFirma expenses, index by normalized number.
  const byNumber = new Map<string, Record<string, unknown>>();
  try {
    for (let page = 1; page <= 100; page++) {
      const batch = await client.findExpenses({ ...opts, page, limit: 100 });
      if (!batch.length) break;
      for (const rec of batch) {
        const { number } = derive(rec);
        if (number) byNumber.set(normNumber(number), rec);
      }
      res.expensesSeen += batch.length;
      if (batch.length < 100) break;
    }
  } catch (e) {
    res.errors.push((e as Error).message);
    return res;
  }

  // Match against local invoices in the same window.
  let q = db.from("invoices").select("id,number,issue_date");
  if (opts.dateFrom) q = q.gte("issue_date", opts.dateFrom);
  if (opts.dateTo) q = q.lte("issue_date", opts.dateTo);
  const { data: invoices, error } = await q;
  if (error) {
    res.errors.push(error.message);
    return res;
  }

  const now = new Date().toISOString();
  for (const inv of invoices || []) {
    const rec = byNumber.get(normNumber(inv.number));
    if (!rec) {
      res.unmatchedLocal++;
      continue;
    }
    res.matched++;
    const { wid, payment, remaining, booking } = derive(rec);
    const { error: upErr } = await db
      .from("invoices")
      .update({
        wfirma_id: wid,
        wfirma_payment_status: payment,
        wfirma_remaining: remaining,
        wfirma_status: booking,
        wfirma_synced_at: now,
      })
      .eq("id", inv.id);
    if (upErr) res.errors.push(`${inv.number}: ${upErr.message}`);
    else res.updated++;
  }

  return res;
}
