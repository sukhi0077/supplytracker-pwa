// src/repositories/MasterDataRepository.js
// Reads/writes the shared reference tables: categories, sub_categories, units,
// plus SupplyTracker's unit_conversions.
import { supabase, withTimeout, unwrap } from "../supabase.js";

export class MasterDataRepository {
  static async getCategories() {
    return (
      unwrap(
        await withTimeout(
          supabase
            .from("categories")
            .select("id,name,sort_order,active")
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          15000,
          "Loading categories",
        ),
        "Loading categories",
      ) || []
    );
  }

  static async getSubCategories() {
    return (
      unwrap(
        await withTimeout(
          supabase
            .from("sub_categories")
            .select("id,category_id,name,sort_order,active")
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          15000,
          "Loading sub-categories",
        ),
        "Loading sub-categories",
      ) || []
    );
  }

  static async getUnits() {
    return (
      unwrap(
        await withTimeout(
          supabase
            .from("units")
            .select("id,code,name,dimension")
            .order("code", { ascending: true }),
          15000,
          "Loading units",
        ),
        "Loading units",
      ) || []
    );
  }

  static async getUnitConversions() {
    return (
      unwrap(
        await withTimeout(
          supabase
            .from("unit_conversions")
            .select("id,from_unit_id,to_unit_id,factor,item_id")
            .order("item_id", { ascending: true, nullsFirst: true }),
          15000,
          "Loading unit conversions",
        ),
        "Loading unit conversions",
      ) || []
    );
  }

  static async getAll() {
    const [categories, subCategories, units, conversions] = await Promise.all([
      MasterDataRepository.getCategories(),
      MasterDataRepository.getSubCategories(),
      MasterDataRepository.getUnits(),
      MasterDataRepository.getUnitConversions(),
    ]);
    return { categories, subCategories, units, conversions };
  }

  // ---- admin writes ---------------------------------------------------------
  static async addCategory(name) {
    return unwrap(
      await withTimeout(
        supabase.from("categories").insert({ name: name.trim() }).select("id").single(),
        15000,
        "Adding category",
      ),
      "Adding category",
    ).id;
  }

  static async addSubCategory(categoryId, name) {
    return unwrap(
      await withTimeout(
        supabase
          .from("sub_categories")
          .insert({ category_id: categoryId, name: name.trim() })
          .select("id")
          .single(),
        15000,
        "Adding sub-category",
      ),
      "Adding sub-category",
    ).id;
  }

  static async addUnit({ code, name = "", dimension = "count" }) {
    return unwrap(
      await withTimeout(
        supabase
          .from("units")
          .insert({ code: code.trim(), name, dimension })
          .select("id")
          .single(),
        15000,
        "Adding unit",
      ),
      "Adding unit",
    ).id;
  }
}
