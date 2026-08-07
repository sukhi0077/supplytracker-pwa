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
          // ksef_name is the legal name as it appears on the KSeF invoice — it
          // often differs from the curated supplier name we display.
          .select("*, supplier:suppliers(name, nip, ksef_name)")
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
    return {
      ...inv,
      supplierName: inv.supplier?.name || "",
      supplierKsefName: inv.supplier?.ksef_name || "",
      supplierNip: inv.supplier?.nip || "",
      lines: lines || [],
    };
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

  // Update a manually-entered invoice's header and REPLACE its lines.
  static async updateWithLines(id, header, lines = []) {
    unwrap(
      await withTimeout(
        supabase
          .from("invoices")
          .update({ ...header, updated_at: new Date().toISOString() })
          .eq("id", id),
        15000,
        "Updating invoice",
      ),
      "Updating invoice",
    );
    unwrap(
      await withTimeout(
        supabase.from("invoice_lines").delete().eq("invoice_id", id),
        15000,
        "Updating invoice lines",
      ),
      "Updating invoice lines",
    );
    if (lines.length) {
      const rows = lines.map((l, i) => ({ ...l, invoice_id: id, line_no: l.line_no ?? i + 1 }));
      unwrap(
        await withTimeout(supabase.from("invoice_lines").insert(rows), 20000, "Saving invoice lines"),
        "Saving invoice lines",
      );
    }
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

  // True number of unmapped lines. getLines() caps at 300 rows, so counting the
  // rows it returned reported "80 unmapped" when unfiltered (80 of the latest
  // 300) and "140" when filtered (the latest 300 unmapped) — two different
  // numbers for the same question. head+exact asks the DB instead.
  static async countUnmappedLines() {
    const { count, error } = await withTimeout(
      supabase.from("invoice_lines").select("id", { count: "exact", head: true }).is("item_id", null),
      15000,
      "Counting unmapped lines",
    );
    if (error) throw error;
    return count || 0;
  }

  // Every unmapped line, not just the page on screen — the recheck must cover
  // the whole backlog. Minimal columns, paged, so a few thousand rows is cheap.
  static async getAllUnmappedLines() {
    const page = 1000;
    const out = [];
    for (let from = 0; ; from += page) {
      const data = unwrap(
        await withTimeout(
          supabase
            .from("invoice_lines")
            .select("id, ksef_item_name_raw, invoice:invoices(supplier_id)")
            .is("item_id", null)
            .order("id", { ascending: false })
            .range(from, from + page - 1),
          20000,
          "Loading unmapped lines",
        ),
        "Loading unmapped lines",
      ) || [];
      out.push(
        ...data.map((r) => ({
          id: r.id,
          ksefItemName: r.ksef_item_name_raw || "",
          supplierId: r.invoice?.supplier_id || null,
        })),
      );
      if (data.length < page) break;
    }
    return out;
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

  // Apply the same (item, pack) to many lines at once. Grouped so a batch of
  // 200 lines that all map to one item costs a single request rather than 200.
  // `groups` is [{ itemId, packSize, ids: [...] }].
  static async applyLineMappings(groups) {
    let changed = 0;
    for (const g of groups) {
      const chunk = 200;
      for (let i = 0; i < g.ids.length; i += chunk) {
        const slice = g.ids.slice(i, i + chunk);
        unwrap(
          await withTimeout(
            supabase
              .from("invoice_lines")
              .update({ item_id: g.itemId, pack_size: Number(g.packSize ?? 1) || 1 })
              .in("id", slice),
            20000,
            "Applying mappings",
          ),
          "Applying mappings",
        );
        changed += slice.length;
      }
    }
    return changed;
  }

  // Remap a line to an item AND set its pack size (base units per invoice unit).
  static async remapLine(lineId, { itemId, packSize }) {
    const patch = { item_id: itemId || null };
    if (packSize != null && packSize !== "") patch.pack_size = Number(packSize);
    unwrap(
      await withTimeout(
        supabase.from("invoice_lines").update(patch).eq("id", lineId),
        15000,
        "Mapping line",
      ),
      "Mapping line",
    );
    return true;
  }
}
