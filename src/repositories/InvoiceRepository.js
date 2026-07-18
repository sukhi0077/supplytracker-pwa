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
}
