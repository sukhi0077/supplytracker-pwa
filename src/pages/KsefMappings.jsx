// src/pages/KsefMappings.jsx
import { useEffect, useMemo, useState } from "react";
import {
  useMappings,
  useItems,
  useSuppliers,
  useAddMapping,
  useUpdateMapping,
  useRemoveMapping,
} from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox, Empty } from "../components/ui/parts.jsx";
import { Field, Text, Num, Select, Btn } from "../components/ui/form.jsx";
import Modal from "../components/ui/Modal.jsx";

function Editor({ open, onClose, mapping }) {
  const isEdit = !!mapping;
  const { data: items } = useItems();
  const { data: suppliers } = useSuppliers();
  const add = useAddMapping();
  const update = useUpdateMapping();
  const [form, setForm] = useState({ ksefItemName: "", itemId: null, supplierId: null, packSize: 1 });
  const [error, setError] = useState("");

  // Sync form when opening.
  useEffect(() => {
    if (open)
      setForm(
        mapping
          ? {
              ksefItemName: mapping.ksefItemName,
              itemId: mapping.itemId,
              supplierId: mapping.supplierId,
              packSize: mapping.packSize,
            }
          : { ksefItemName: "", itemId: null, supplierId: null, packSize: 1 },
      );
  }, [open, mapping]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setError("");
    if (!form.ksefItemName.trim()) return setError("KSeF item text is required.");
    if (!form.itemId) return setError("Pick the catalogue item.");
    try {
      if (isEdit) await update.mutateAsync({ id: mapping.id, patch: form });
      else await add.mutateAsync(form);
      onClose();
    } catch (e) {
      setError(e.message || "Save failed.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit mapping" : "New mapping"}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={add.isPending || update.isPending}>
            Save
          </Btn>
        </>
      }
    >
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="space-y-3">
        <Field label="KSeF item text" hint="Raw item name as it appears on the invoice.">
          <Text value={form.ksefItemName} onChange={set("ksefItemName")} />
        </Field>
        <Field label="Catalogue item">
          <Select value={form.itemId} onChange={set("itemId")} options={(items || []).map((it) => ({ value: it.id, label: it.name }))} placeholder="Pick…" />
        </Field>
        <Field label="Supplier" hint="Leave blank for a global mapping (any supplier).">
          <Select value={form.supplierId} onChange={set("supplierId")} options={(suppliers || []).map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
        <Field label="Pack size" hint="Base units per invoice unit (e.g. 10 for a 10 kg sack).">
          <Num value={form.packSize} onChange={set("packSize")} min={0} />
        </Field>
      </div>
    </Modal>
  );
}

export default function KsefMappings({ isAdmin }) {
  const { data, isLoading, error } = useMappings();
  const remove = useRemoveMapping();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data || []).filter(
      (m) => !n || m.ksefItemName.toLowerCase().includes(n) || m.itemName.toLowerCase().includes(n),
    );
  }, [data, q]);

  return (
    <div>
      <PageHeader
        title="KSeF mappings"
        subtitle="Map raw KSeF invoice text to catalogue items."
        right={isAdmin && (
          <Btn variant="primary" onClick={() => { setEditing(null); setOpen(true); }}>+ New mapping</Btn>
        )}
      />

      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search KSeF text or item…"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Loading label="Loading mappings…" />
      ) : rows.length === 0 ? (
        <Card className="p-2"><Empty>No mappings yet.</Empty></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">KSeF text</th>
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold text-right">Pack</th>
                  {isAdmin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 text-slate-700">{m.ksefItemName}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{m.itemName}</td>
                    <td className="px-4 py-2.5 text-slate-500">{m.supplierName || <span className="text-slate-400">(any)</span>}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{m.packSize}</td>
                    {isAdmin && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => { setEditing(m); setOpen(true); }} className="mr-1 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">Edit</button>
                        <button onClick={() => remove.mutate(m.id)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isAdmin && <Editor open={open} onClose={() => setOpen(false)} mapping={editing} />}
    </div>
  );
}
