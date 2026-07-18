// src/repositories/ItemRepository.js
// The catalogue lives in the shared `items` table. SupplyTracker's extra fields
// (default_uom_id, primary_supplier_id, notes, reorder_frequency_days,
// last_ordered_at) were added by supabase/schema.sql. We map Django-style names
// to the shared columns at this boundary:
//   default_unit  <-> unit          default_vat_rate <-> vat_rate
//   is_active     <-> active        sub_category(FK) <-> sub_category_id
import { supabase, withTimeout, unwrap, toTs } from "../supabase.js";

function fromRow(r) {
  return {
    id: r.id,
    code: r.code || "",
    name: r.name || "",
    category: r.category || "",
    subCategory: r.sub_category || "",
    subCategoryId: r.sub_category_id || null,
    defaultUnit: r.unit || "",
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
    category: "category",
    subCategory: "sub_category",
    subCategoryId: "sub_category_id",
    defaultUnit: "unit",
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
