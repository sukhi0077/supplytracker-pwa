// src/repositories/SalesRepository.js
// Monthly sales uploads -> shared sales_records table. Idempotent on
// (month, category, item_name) so re-uploading a month is safe.
import { supabase, withTimeout, unwrap } from "../supabase.js";

export class SalesRepository {
  static async getAll({ month } = {}) {
    let q = supabase.from("sales_records").select("*").order("month", { ascending: false });
    if (month) q = q.eq("month", month);
    const data = unwrap(await withTimeout(q, 15000, "Loading sales"), "Loading sales");
    return data || [];
  }

  // Distinct months present, newest first.
  static async getMonths() {
    const data = unwrap(
      await withTimeout(
        supabase.from("sales_records").select("month").order("month", { ascending: false }),
        15000,
        "Loading months",
      ),
      "Loading months",
    );
    return [...new Set((data || []).map((r) => r.month))];
  }

  // Upsert an array of {month, category, item_name, status, units, revenue}.
  static async importRecords(records) {
    const chunk = 400;
    let n = 0;
    for (let i = 0; i < records.length; i += chunk) {
      const rows = records.slice(i, i + chunk);
      unwrap(
        await withTimeout(
          supabase.from("sales_records").upsert(rows, { onConflict: "month,category,item_name" }),
          25000,
          "Importing sales",
        ),
        "Importing sales",
      );
      n += rows.length;
    }
    return n;
  }
}
