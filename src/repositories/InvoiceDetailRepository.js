// src/repositories/InvoiceDetailRepository.js
// The purchase / orders log (Django InvoiceDetail) -> shared invoice_details.
import { supabase, withTimeout, unwrap } from "../supabase.js";

export class InvoiceDetailRepository {
  static async getAll({ limit = 300 } = {}) {
    const data = unwrap(
      await withTimeout(
        supabase
          .from("invoice_details")
          .select("*, supplier:suppliers(name), item:items(name)")
          .order("order_date", { ascending: false })
          .limit(limit),
        15000,
        "Loading order log",
      ),
      "Loading order log",
    );
    return (data || []).map((r) => ({
      id: r.id,
      orderDate: r.order_date,
      supplierId: r.supplier_id,
      supplierName: r.supplier?.name || "",
      itemId: r.item_id,
      itemName: r.item?.name || "(unmapped)",
      unit: "",
      quantity: r.quantity,
      packSize: r.pack_size,
      unitPriceNet: r.unit_price_net,
      lineTotalNet: r.line_total_net,
      lineTotalGross: r.line_total_gross,
      notes: r.notes || "",
    }));
  }

  static async add(row) {
    return unwrap(
      await withTimeout(
        supabase
          .from("invoice_details")
          .insert({
            order_date: row.orderDate,
            supplier_id: row.supplierId,
            item_id: row.itemId || null,
            quantity: row.quantity ?? 0,
            pack_size: row.packSize ?? 1,
            unit_price_net: row.unitPriceNet ?? null,
            unit_price_gross: row.unitPriceGross ?? null,
            line_total_net: row.lineTotalNet ?? null,
            line_total_gross: row.lineTotalGross ?? null,
            notes: row.notes || "",
          })
          .select("id")
          .single(),
        15000,
        "Adding order line",
      ),
      "Adding order line",
    ).id;
  }

  static async remove(id) {
    unwrap(
      await withTimeout(
        supabase.from("invoice_details").delete().eq("id", id),
        15000,
        "Deleting order line",
      ),
      "Deleting order line",
    );
    return true;
  }
}
