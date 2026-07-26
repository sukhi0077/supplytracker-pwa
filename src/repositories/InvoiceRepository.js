// src/repositories/InvoiceRepository.js
import { supabase, withTimeout, unwrap } from "../supabase.js";

export class InvoiceRepository {
  // List invoices with the supplier name joined in (most recent first).
  static async getAll({ limit = 200 } = {}) {
    const data = unwrap(
      await withTimeout(
        supabase
          .from("invoices")
          .select("*, supplier:suppliers(name)")
          .order("issue_date", { ascending: false })
          .limit(limit),
        15000,
        "Loading invoices",
      ),
      "Loading invoices",
    );
    return (data || []).map((r) => ({
      ...r,
      supplierName: r.supplier?.name || "",
    }));
  }

  static async getById(id) {
    const inv = unwrap(
      await withTimeout(
        supabase
          .from("invoices")
          .select("*, supplier:suppliers(name)")
          .eq("id", id)
          .single(),
        15000,
        "Loading invoice",
      ),
      "Loading invoice",
    );
    const lines = unwrap(
      await withTimeout(
        supabase
          .from("invoice_lines")
          .select("*, item:items(name)")
          .eq("invoice_id", id)
          .order("line_no", { ascending: true }),
        15000,
        "Loading invoice lines",
      ),
      "Loading invoice lines",
    );
    return { ...inv, supplierName: inv.supplier?.name || "", lines: lines || [] };
  }

  static async count() {
    const { count, error } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    return count || 0;
  }

  // Create an invoice header + its lines in one go (manual entry).
  // `header` uses snake_case DB columns; `lines` is an array of line objects.
  static async createWithLines(header, lines = []) {
    const inv = unwrap(
      await withTimeout(
        supabase
          .from("invoices")
          .insert({ ...header, status: header.status || "draft" })
          .select("id")
          .single(),
        15000,
        "Creating invoice",
      ),
      "Creating invoice",
    );
    if (lines.length) {
      const rows = lines.map((l, i) => ({ ...l, invoice_id: inv.id, line_no: l.line_no ?? i + 1 }));
      unwrap(
        await withTimeout(
          supabase.from("invoice_lines").insert(rows),
          20000,
          "Saving invoice lines",
        ),
        "Saving invoice lines",
      );
    }
    return inv.id;
  }

  static async update(id, patch) {
    unwrap(
      await withTimeout(
        supabase
          .from("invoices")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", id),
        15000,
        "Updating invoice",
      ),
      "Updating invoice",
    );
    return true;
  }

  // Invoice LINE items across all invoices — the "Invoice details" view. Joins
  // the parent invoice (number/date/supplier) and the mapped catalogue item.
  static async getLines({ unmappedOnly = false, search = "", limit = 300 } = {}) {
    let q = supabase
      .from("invoice_lines")
      .select(
        "id, invoice_id, line_no, item_id, ksef_item_name_raw, quantity, unit, net_total, vat_rate, gross_total, pack_size, " +
          "invoice:invoices(number, issue_date, supplier:suppliers(id, name, ksef_name)), item:items(name)",
      )
      .order("id", { ascending: false })
      .limit(limit);
    if (unmappedOnly) q = q.is("item_id", null);
    if (search.trim()) q = q.ilike("ksef_item_name_raw", `%${search.trim()}%`);
    const data = unwrap(await withTimeout(q, 15000, "Loading invoice lines"), "Loading invoice lines");
    return (data || []).map((r) => ({
      id: r.id,
      invoiceId: r.invoice_id,
      lineNo: r.line_no,
      itemId: r.item_id,
      itemName: r.item?.name || "",
      ksefItemName: r.ksef_item_name_raw || "",
      quantity: r.quantity,
      unit: r.unit,
      netTotal: r.net_total,
      grossTotal: r.gross_total,
      vatRate: r.vat_rate,
      packSize: r.pack_size,
      invoiceNumber: r.invoice?.number || "",
      issueDate: r.invoice?.issue_date || "",
      supplierId: r.invoice?.supplier?.id || null,
      supplierName: r.invoice?.supplier?.name || "",
      supplierKsefName: r.invoice?.supplier?.ksef_name || "",
    }));
  }

  static async setLineItem(lineId, itemId) {
    unwrap(
      await withTimeout(
        supabase.from("invoice_lines").update({ item_id: itemId || null }).eq("id", lineId),
        15000,
        "Mapping line",
      ),
      "Mapping line",
    );
    return true;
  }
}
