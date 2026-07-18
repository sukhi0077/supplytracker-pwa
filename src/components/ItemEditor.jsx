// src/components/ItemEditor.jsx
import { useEffect, useState } from "react";
import Modal from "./ui/Modal.jsx";
import { Field, Text, Num, Area, Select, Btn } from "./ui/form.jsx";
import { useAddItem, useUpdateItem, useMasterData, useSuppliers } from "../hooks/useCatalogue.js";

const EMPTY = {
  code: "",
  name: "",
  category: "",
  subCategory: "",
  defaultUnit: "szt",
  defaultVatRate: 23,
  reorderFrequencyDays: null,
  supplier: "",
  primarySupplierId: null,
  matchKeywords: "",
  notes: "",
  isActive: true,
};

export default function ItemEditor({ open, onClose, item }) {
  const isEdit = !!item;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const add = useAddItem();
  const update = useUpdateItem();
  const { data: master } = useMasterData();
  const { data: suppliers } = useSuppliers();

  useEffect(() => {
    setError("");
    setForm(item ? { ...EMPTY, ...item } : EMPTY);
  }, [item, open]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const categories = master?.categories || [];
  const subCats = (master?.subCategories || []).filter((s) => {
    const cat = categories.find((c) => c.name === form.category);
    return cat ? s.category_id === cat.id : true;
  });
  const units = master?.units || [];

  const save = async () => {
    setError("");
    if (!form.name.trim()) return setError("Name is required.");
    try {
      if (isEdit) {
        await update.mutateAsync({ id: item.id, patch: form });
      } else {
        await add.mutateAsync(form);
      }
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
      title={isEdit ? `Edit item` : "New item"}
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
          <Text value={form.name} onChange={set("name")} placeholder="Master item name" />
        </Field>
        <Field label="Code" hint="Leave blank for new items to auto-assign OSP-#####.">
          <Text value={form.code} onChange={set("code")} placeholder="ITM-0001" />
        </Field>
        <Field label="Category">
          <Select
            value={form.category}
            onChange={(v) => setForm((f) => ({ ...f, category: v || "", subCategory: "" }))}
            options={categories.map((c) => ({ value: c.name, label: c.name }))}
            placeholder="—"
          />
        </Field>
        <Field label="Sub-category">
          <Select
            value={form.subCategory}
            onChange={set("subCategory")}
            options={subCats.map((s) => ({ value: s.name, label: s.name }))}
          />
        </Field>
        <Field label="Unit (display)">
          <Select
            value={form.defaultUnit}
            onChange={set("defaultUnit")}
            options={units.map((u) => ({ value: u.code, label: u.code }))}
            placeholder="szt"
          />
        </Field>
        <Field label="VAT %">
          <Num value={form.defaultVatRate} onChange={set("defaultVatRate")} min={0} max={100} />
        </Field>
        <Field label="Supplier (text)">
          <Text value={form.supplier} onChange={set("supplier")} placeholder="Primary supplier name" />
        </Field>
        <Field label="Primary supplier (linked)">
          <Select
            value={form.primarySupplierId}
            onChange={set("primarySupplierId")}
            options={(suppliers || []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
        <Field label="Reorder frequency (days)">
          <Num value={form.reorderFrequencyDays} onChange={set("reorderFrequencyDays")} min={0} />
        </Field>
        <Field label="Active">
          <Select
            value={form.isActive ? "1" : "0"}
            onChange={(v) => set("isActive")(v === "1")}
            options={[
              { value: "1", label: "Active" },
              { value: "0", label: "Inactive" },
            ]}
            placeholder="Active"
          />
        </Field>
        <Field label="KSeF match keywords" className="sm:col-span-2" hint="Comma/space separated; used to auto-match invoice lines.">
          <Text value={form.matchKeywords} onChange={set("matchKeywords")} placeholder="mięta, mieta" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Area value={form.notes} onChange={set("notes")} />
        </Field>
      </div>
    </Modal>
  );
}
