// src/repositories/StockRepository.js
import { supabase, withTimeout, unwrap } from "../supabase.js";

// Derive a status label the same way SupplyTracker's StockLevel.status property does.
export function stockStatus(level) {
  const cq = Number(level.current_qty ?? 0);
  if (cq <= 0) return "out";
  if (level.safety_stock != null && cq <= Number(level.safety_stock)) return "critical";
  if (level.reorder_point != null && cq <= Number(level.reorder_point)) return "low";
  return "ok";
}

export class StockRepository {
  static async getLevels() {
    const data = unwrap(
      await withTimeout(
        supabase
          .from("stock_levels")
          .select("*, item:items(name, code, active)")
          .order("current_qty", { ascending: true }),
        15000,
        "Loading stock",
      ),
      "Loading stock",
    );
    return (data || []).map((r) => ({
      ...r,
      itemName: r.item?.name || "",
      itemUnit: "",
      itemCode: r.item?.code || "",
      status: stockStatus(r),
    }));
  }

  // Record a signed movement; the DB trigger updates stock_levels.current_qty.
  static async addMovement({ itemId, qty, kind, happenedAt, notes = "" }) {
    unwrap(
      await withTimeout(
        supabase.from("stock_movements").insert({
          item_id: itemId,
          qty,
          kind,
          happened_at: happenedAt,
          notes,
        }),
        15000,
        "Saving stock movement",
      ),
      "Saving stock movement",
    );
    return true;
  }

  static async recentMovements({ limit = 100 } = {}) {
    const data = unwrap(
      await withTimeout(
        supabase
          .from("stock_movements")
          .select("*, item:items(name)")
          .order("happened_at", { ascending: false })
          .limit(limit),
        15000,
        "Loading movements",
      ),
      "Loading movements",
    );
    return (data || []).map((r) => ({ ...r, itemName: r.item?.name || "" }));
  }
}
