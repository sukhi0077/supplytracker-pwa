// src/repositories/KsefMappingRepository.js
// Maps raw KSeF invoice item text -> catalogue item (shared ksef_mappings table).
//
// IMPORTANT: mappings are consulted by the Worker at FETCH time — it copies
// item_id and pack_size onto each invoice_line as the invoice is imported.
// Editing a mapping afterwards therefore changes nothing about invoices you
// already have, and the dashboard (which reads invoice_lines) keeps showing the
// old numbers. `findMatchingLines` / `applyToExistingLines` below exist to
// backfill those lines on demand.
import { supabase, withTimeout, unwrap } from "../supabase.js";

// PostgREST `ilike` with no wildcards is a case-insensitive equality test.
// Escape the wildcard characters so an item name containing % or _ can't widen
// the match.
const literal = (s) => String(s || "").trim().replace(/[%_]/g, (c) => `\\${c}`);

// A mapping stored with this text is a supplier catch-all: it applies to every
// line from that supplier whatever the wording. For utilities and services,
// where the description changes every month but the item never does.
export const CATCH_ALL = "*";
export const isCatchAll = (name) => String(name || "").trim() === CATCH_ALL;

export class KsefMappingRepository {
  // Invoice lines this mapping would apply to. Scoped to the supplier when the
  // mapping is supplier-specific, otherwise every supplier.
  static async findMatchingLines({ ksefItemName, supplierId = null }) {
    // A catch-all matches by supplier, not by text — and only lines that are
    // still unmapped, so it can't overwrite mappings that are already right.
    if (isCatchAll(ksefItemName)) {
      if (!supplierId) return [];
      return (
        unwrap(
          await withTimeout(
            supabase
              .from("invoice_lines")
              .select("id, invoice_id, item_id, invoice:invoices!inner(supplier_id)")
              .is("item_id", null)
              .eq("invoice.supplier_id", supplierId),
            20000,
            "Finding supplier lines",
          ),
          "Finding supplier lines",
        ) || []
      );
    }

    const name = literal(ksefItemName);
    if (!name) return [];
    const lines = unwrap(
      await withTimeout(
        supabase
          .from("invoice_lines")
          .select("id, invoice_id, item_id, pack_size")
          .ilike("ksef_item_name_raw", name),
        20000,
        "Finding matching invoice lines",
      ),
      "Finding matching invoice lines",
    ) || [];
    if (!supplierId || !lines.length) return lines;

    const invoiceIds = [...new Set(lines.map((l) => l.invoice_id))];
    const invoices = unwrap(
      await withTimeout(
        supabase.from("invoices").select("id").eq("supplier_id", supplierId).in("id", invoiceIds),
        20000,
        "Finding supplier invoices",
      ),
      "Finding supplier invoices",
    ) || [];
    const keep = new Set(invoices.map((i) => i.id));
    return lines.filter((l) => keep.has(l.invoice_id));
  }

  // Write the mapping onto those lines. Returns how many were changed.
  static async applyToExistingLines({ ksefItemName, itemId, supplierId = null, packSize = 1 }) {
    const lines = await this.findMatchingLines({ ksefItemName, supplierId });
    if (!lines.length) return 0;
    const ids = lines.map((l) => l.id);
    // Chunked: `in` on a few thousand ids makes for an unhappy URL.
    const chunk = 200;
    for (let i = 0; i < ids.length; i += chunk) {
      unwrap(
        await withTimeout(
          supabase
            .from("invoice_lines")
            .update({ item_id: itemId, pack_size: packSize })
            .in("id", ids.slice(i, i + chunk)),
          20000,
          "Applying mapping to invoice lines",
        ),
        "Applying mapping to invoice lines",
      );
    }
    return ids.length;
  }

  static async getAll() {
    const data = unwrap(
      await withTimeout(
        supabase
          .from("ksef_mappings")
          .select("*, item:items(name), supplier:suppliers(name)")
          .order("ksef_item_name", { ascending: true }),
        15000,
        "Loading mappings",
      ),
      "Loading mappings",
    );
    return (data || []).map((r) => ({
      id: r.id,
      ksefItemName: r.ksef_item_name,
      itemId: r.item_id,
      itemName: r.item?.name || "",
      supplierId: r.supplier_id,
      supplierName: r.supplier?.name || "",
      packSize: r.pack_size,
    }));
  }

  static async add({ ksefItemName, itemId, supplierId = null, packSize = 1 }) {
    return unwrap(
      await withTimeout(
        supabase
          .from("ksef_mappings")
          .insert({
            ksef_item_name: ksefItemName.trim(),
            item_id: itemId,
            supplier_id: supplierId,
            pack_size: packSize,
          })
          .select("id")
          .single(),
        15000,
        "Adding mapping",
      ),
      "Adding mapping",
    ).id;
  }

  static async update(id, { ksefItemName, itemId, supplierId, packSize }) {
    const patch = {};
    if (ksefItemName !== undefined) patch.ksef_item_name = ksefItemName.trim();
    if (itemId !== undefined) patch.item_id = itemId;
    if (supplierId !== undefined) patch.supplier_id = supplierId;
    if (packSize !== undefined) patch.pack_size = packSize;
    unwrap(
      await withTimeout(
        supabase.from("ksef_mappings").update(patch).eq("id", id),
        15000,
        "Updating mapping",
      ),
      "Updating mapping",
    );
    return true;
  }

  static async remove(id) {
    unwrap(
      await withTimeout(
        supabase.from("ksef_mappings").delete().eq("id", id),
        15000,
        "Deleting mapping",
      ),
      "Deleting mapping",
    );
    return true;
  }
}
