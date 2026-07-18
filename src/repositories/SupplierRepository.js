// src/repositories/SupplierRepository.js
// Shared `suppliers` table, extended with SupplyTracker's operational fields.
import { supabase, withTimeout, unwrap } from "../supabase.js";

function fromRow(r) {
  return {
    id: r.id,
    name: r.name || "",
    nip: r.nip || "",
    ksefName: r.ksef_name || "",
    address: r.address || "",
    email: r.email || "",
    phone: r.phone || "",
    notes: r.notes || "",
    paymentTermsDays: r.payment_terms_days ?? null,
    minOrderValue: r.min_order_value ?? null,
    iban: r.iban || "",
    deliveryDays: r.delivery_days || "",
    cutoffTime: r.cutoff_time || null,
    isActive: r.active !== false,
  };
}

function toRow(obj = {}) {
  const map = {
    name: "name",
    nip: "nip",
    ksefName: "ksef_name",
    address: "address",
    email: "email",
    phone: "phone",
    notes: "notes",
    paymentTermsDays: "payment_terms_days",
    minOrderValue: "min_order_value",
    iban: "iban",
    deliveryDays: "delivery_days",
    cutoffTime: "cutoff_time",
    isActive: "active",
  };
  const row = {};
  for (const [camel, snake] of Object.entries(map)) {
    if (obj[camel] !== undefined) row[snake] = obj[camel];
  }
  return row;
}

export class SupplierRepository {
  static async getAll() {
    const data = unwrap(
      await withTimeout(
        supabase.from("suppliers").select("*").order("name", { ascending: true }),
        15000,
        "Loading suppliers",
      ),
      "Loading suppliers",
    );
    return (data || []).map(fromRow);
  }

  static async add(supplier) {
    const data = unwrap(
      await withTimeout(
        supabase
          .from("suppliers")
          .insert({ ...toRow({ ...supplier, isActive: supplier.isActive !== false }) })
          .select("id")
          .single(),
        15000,
        "Adding supplier",
      ),
      "Adding supplier",
    );
    return data.id;
  }

  static async update(supplierId, patch) {
    unwrap(
      await withTimeout(
        supabase.from("suppliers").update(toRow(patch)).eq("id", supplierId),
        15000,
        "Updating supplier",
      ),
      "Updating supplier",
    );
    return true;
  }

  static async setActive(supplierId, isActive) {
    return SupplierRepository.update(supplierId, { isActive: !!isActive });
  }
}
