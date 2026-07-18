// src/repositories/KsefMappingRepository.js
// Maps raw KSeF invoice item text -> catalogue item (shared ksef_mappings table).
import { supabase, withTimeout, unwrap } from "../supabase.js";

export class KsefMappingRepository {
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
