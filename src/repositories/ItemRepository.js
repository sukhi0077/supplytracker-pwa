// src/repositories/ItemRepository.js
// The catalogue lives in the shared `items` table. Category / sub-category / unit
// are NORMALISED: items store category_id / sub_category_id / unit_id FKs only
// (the old text columns were dropped). We read the display names by joining the
// master tables, and write the FK ids.
import { supabase, withTimeout, unwrap, toTs } from "../supabase.js";

// We read items with `select("*")` (never errors on missing columns) and keep
// the FK ids. Category / sub-category / unit NAMES are resolved on the client
// from the master tables (see Items page), so nothing depends on PostgREST embed
// syntax or on columns that a given DB may or may not have.
function fromRow(r) {
  return {
    id: r.id,
    code: r.code || "",
    name: r.name || "",
    // Names are filled in by the page from master data; ids are the source.
    category: "",
    subCategory: "",
    categoryId: r.category_id || null,
    subCategoryId: r.sub_category_id || null,
    defaultUnit: "",
    unitId: r.unit_id || null,
    defaultUomId: r.default_uom_id || null,
    defaultVatRate: r.vat_rate ?? null,
    matchKeywords: r.match_keywords || "",
    reorderFrequencyDays: r.reorder_frequency_days ?? null,
    lastOrderedAt: r.last_ordered_at || null,
    supplier: r.supplier || "",
    primarySupplierId: r.primary_supplier_id || null,
    notes: r.notes || "",
    isActive: r.active !== false,
    createdAt: toTs(r.created_at),
  };
}

function toRow(obj = {}) {
  const map = {
    code: "code",
    name: "name",
    categoryId: "category_id",
    subCategoryId: "sub_category_id",
    unitId: "unit_id",
    defaultUomId: "default_uom_id",
    defaultVatRate: "vat_rate",
    matchKeywords: "match_keywords",
    reorderFrequencyDays: "reorder_frequency_days",
    lastOrderedAt: "last_ordered_at",
    supplier: "supplier",
    primarySupplierId: "primary_supplier_id",
    notes: "notes",
    isActive: "active",
  };
  const row = {};
  for (const [camel, snake] of Object.entries(map)) {
    if (obj[camel] !== undefined) row[snake] = obj[camel];
  }
  return row;
}

export class ItemRepository {
  static async getAll() {
    const data = unwrap(
      await withTimeout(
        supabase.from("items").select("*").order("name", { ascending: true }),
        15000,
        "Loading items",
      ),
      "Loading items",
    );
    return (data || []).map(fromRow);
  }

  static async add(item) {
    const data = unwrap(
      await withTimeout(
        supabase
          .from("items")
          .insert({ ...toRow({ ...item, isActive: item.isActive !== false }) })
          .select("id")
          .single(),
        15000,
        "Adding item",
      ),
      "Adding item",
    );
    return data.id;
  }

  static async update(itemId, patch) {
    unwrap(
      await withTimeout(
        supabase
          .from("items")
          .update({ ...toRow(patch), updated_at: new Date().toISOString() })
          .eq("id", itemId),
        15000,
        "Updating item",
      ),
      "Updating item",
    );
    return true;
  }

  static async setActive(itemId, isActive) {
    return ItemRepository.update(itemId, { isActive: !!isActive });
  }

  static async remove(itemId) {
    unwrap(
      await withTimeout(
        supabase.from("items").delete().eq("id", itemId),
        15000,
        "Deleting item",
      ),
      "Deleting item",
    );
    return true;
  }
}
