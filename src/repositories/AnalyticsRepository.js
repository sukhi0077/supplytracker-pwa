// src/repositories/AnalyticsRepository.js
// Pulls the raw purchase data for the dashboard: invoices in a date range and
// their line items. Aggregation (by category / supplier / month / item) is done
// client-side in the Dashboard from these + the items catalogue.
import { supabase, withTimeout, unwrap } from "../supabase.js";

async function linesForInvoices(ids) {
  const out = [];
  const chunk = 300;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const data = unwrap(
      await withTimeout(
        supabase
          .from("invoice_lines")
          .select(
            "id, invoice_id, item_id, quantity, unit, pack_size, net_unit, gross_unit, net_total, gross_total, ksef_item_name_raw",
          )
          .in("invoice_id", slice),
        20000,
        "Loading invoice lines",
      ),
      "Loading invoice lines",
    );
    out.push(...(data || []));
  }
  return out;
}

export class AnalyticsRepository {
  static async getPurchaseData({ from, to }) {
    let q = supabase
      .from("invoices")
      .select("id, number, issue_date, net_total, vat_total, gross_total, supplier:suppliers(id, name)")
      .order("issue_date", { ascending: true });
    if (from) q = q.gte("issue_date", from);
    if (to) q = q.lte("issue_date", to);
    const invoices = unwrap(await withTimeout(q, 20000, "Loading invoices"), "Loading invoices") || [];

    const ids = invoices.map((i) => i.id);
    const lines = ids.length ? await linesForInvoices(ids) : [];

    return {
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        issueDate: i.issue_date,
        net: Number(i.net_total || 0),
        vat: Number(i.vat_total || 0),
        gross: Number(i.gross_total || 0),
        supplierId: i.supplier?.id || null,
        supplierName: i.supplier?.name || "—",
      })),
      lines: lines.map((l) => {
        const qty = Number(l.quantity || 0);
        const net = Number(l.net_total || 0);
        // Unit price: prefer the stated one, else derive it from the total.
        // Some suppliers only populate totals.
        const netUnit = l.net_unit != null && l.net_unit !== "" ? Number(l.net_unit) : qty ? net / qty : null;
        const grossUnit =
          l.gross_unit != null && l.gross_unit !== ""
            ? Number(l.gross_unit)
            : qty
              ? Number(l.gross_total || 0) / qty
              : null;
        // pack_size = base units per invoice unit, so base-unit price is
        // unitPrice / pack. That's what makes a 10 kg sack comparable to a 1 kg bag.
        const pack = Number(l.pack_size || 1) || 1;
        return {
          id: l.id,
          invoiceId: l.invoice_id,
          itemId: l.item_id,
          ksefName: l.ksef_item_name_raw || "",
          quantity: qty,
          unit: l.unit || "",
          packSize: pack,
          netUnit,
          grossUnit,
          netPerBase: netUnit == null ? null : netUnit / pack,
          grossPerBase: grossUnit == null ? null : grossUnit / pack,
          baseQuantity: qty * pack,
          net,
          gross: Number(l.gross_total || 0),
        };
      }),
    };
  }
}
