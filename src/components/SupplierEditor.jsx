// src/components/SupplierEditor.jsx
import { useEffect, useState } from "react";
import Modal from "./ui/Modal.jsx";
import { Field, Text, Num, Area, Select, Btn } from "./ui/form.jsx";
import { useAddSupplier, useUpdateSupplier } from "../hooks/useCatalogue.js";

const EMPTY = {
  name: "",
  nip: "",
  ksefName: "",
  email: "",
  phone: "",
  address: "",
  iban: "",
  paymentTermsDays: null,
  minOrderValue: null,
  deliveryDays: "",
  notes: "",
  isActive: true,
};

export default function SupplierEditor({ open, onClose, supplier }) {
  const isEdit = !!supplier;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const add = useAddSupplier();
  const update = useUpdateSupplier();

  useEffect(() => {
    setError("");
    setForm(supplier ? { ...EMPTY, ...supplier } : EMPTY);
  }, [supplier, open]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setError("");
    if (!form.name.trim()) return setError("Name is required.");
    try {
      if (isEdit) await update.mutateAsync({ id: supplier.id, patch: form });
      else await add.mutateAsync(form);
      onClose();
    } catch (e) {
      setError(e.message || "Save failed.");
    }
  };

  const busy = add.isPending || update.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit supplier" : "New supplier"}
      wide
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Btn>
        </>
      }
    >
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Text value={form.name} onChange={set("name")} placeholder="Short display name" />
        </Field>
        <Field label="NIP (tax id)">
          <Text value={form.nip} onChange={set("nip")} />
        </Field>
        <Field label="Legal name (KSeF)" className="sm:col-span-2">
          <Text value={form.ksefName} onChange={set("ksefName")} placeholder="Full legal name on invoices" />
        </Field>
        <Field label="Email">
          <Text value={form.email} onChange={set("email")} type="email" />
        </Field>
        <Field label="Phone">
          <Text value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="IBAN">
          <Text value={form.iban} onChange={set("iban")} />
        </Field>
        <Field label="Payment terms (days)">
          <Num value={form.paymentTermsDays} onChange={set("paymentTermsDays")} min={0} />
        </Field>
        <Field label="Min order value (PLN)">
          <Num value={form.minOrderValue} onChange={set("minOrderValue")} min={0} />
        </Field>
        <Field label="Delivery days" hint="e.g. Mon,Wed,Fri">
          <Text value={form.deliveryDays} onChange={set("deliveryDays")} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Area value={form.address} onChange={set("address")} rows={2} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Area value={form.notes} onChange={set("notes")} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
