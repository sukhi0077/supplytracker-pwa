// src/pages/Suppliers.jsx — matches the original SupplyTracker Suppliers screen:
// inline add/edit form + sortable table (Name, KSeF Name, NIP, Email, Notes,
// Active). Backed by the shared Supabase suppliers table.
import { useMemo, useState } from "react";
import { useSuppliers, useAddSupplier, useUpdateSupplier } from "../hooks/useCatalogue.js";
import { useSort } from "../hooks/useSort.js";
import { SortTh } from "../components/SortTh.jsx";
import { Loading, ErrorBox } from "../components/ui/parts.jsx";

const EMPTY = { name: "", ksefName: "", nip: "", email: "", notes: "", isActive: true };

const inp = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400";
const accentBtn = "rounded-md bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50";

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-600">{label}</label>
      {children}
    </div>
  );
}

export default function Suppliers({ isAdmin }) {
  const { data, isLoading, error } = useSuppliers();
  const add = useAddSupplier();
  const update = useUpdateSupplier();

  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const formOpen = adding || editId != null;

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return data || [];
    return (data || []).filter((r) => `${r.name} ${r.ksefName} ${r.nip}`.toLowerCase().includes(n));
  }, [data, q]);
  const { sorted, sort } = useSort(filtered, { key: "name" });

  const openAdd = () => { setEditId(null); setForm(EMPTY); setErr(""); setAdding(true); };
  const openEdit = (s) => {
    setAdding(false);
    setErr("");
    setEditId(s.id);
    setForm({ name: s.name, ksefName: s.ksefName || "", nip: s.nip || "", email: s.email || "", notes: s.notes || "", isActive: s.isActive });
  };
  const close = () => { setAdding(false); setEditId(null); setErr(""); };

  const save = async () => {
    if (!form.name.trim()) return setErr("Enter a supplier name.");
    setBusy(true);
    setErr("");
    try {
      const patch = { ...form, name: form.name.trim() };
      if (editId == null) await add.mutateAsync(patch);
      else await update.mutateAsync({ id: editId, patch });
      close();
    } catch (e) {
      setErr(e.message || "Could not save the supplier.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Suppliers</h2>
        {isAdmin && (
          <button onClick={() => (formOpen ? close() : openAdd())} className={accentBtn}>
            {formOpen ? "Close" : "+ Add supplier"}
          </button>
        )}
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
        {err && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

        {formOpen && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 font-semibold text-slate-700">{editId == null ? "New supplier" : "Edit supplier"}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Field label="Name *">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} />
              </Field>
              <Field label="KSeF legal name">
                <input value={form.ksefName} onChange={(e) => setForm({ ...form, ksefName: e.target.value })} className={inp} />
              </Field>
              <Field label="NIP">
                <input value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} className={inp} />
              </Field>
              <Field label="Email">
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} />
              </Field>
              <Field label="Notes">
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inp} />
              </Field>
              <Field label="Active">
                <label className="flex h-8 items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  {form.isActive ? "Active" : "Inactive"}
                </label>
              </Field>
              <div className="col-span-full">
                <button onClick={save} disabled={busy} className={accentBtn}>
                  {busy ? "Saving…" : editId == null ? "Save supplier" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        <input
          type="search"
          placeholder="Search name, KSeF name, NIP…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inp} mb-3`}
        />

        {error ? (
          <ErrorBox error={error} />
        ) : isLoading ? (
          <Loading label="Loading suppliers…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <SortTh label="Name" field="name" sort={sort} />
                  <SortTh label="KSeF Name" field="ksefName" sort={sort} />
                  <SortTh label="NIP" field="nip" sort={sort} />
                  <SortTh label="Email" field="email" sort={sort} />
                  <SortTh label="Notes" field="notes" sort={sort} />
                  <SortTh label="Active" field="isActive" sort={sort} />
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((s) => (
                  <tr key={s.id} className={s.isActive ? "" : "opacity-55"}>
                    <td className="px-3 py-2 font-medium text-slate-900">{s.name}</td>
                    <td className="px-3 py-2 text-slate-500">{s.ksefName || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{s.nip || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{s.email || "—"}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-slate-500" title={s.notes || ""}>{s.notes || "—"}</td>
                    <td className="px-3 py-2">{s.isActive ? "✓" : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin && (
                        <button onClick={() => openEdit(s)} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50">
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">
          {filtered.length} supplier{filtered.length === 1 ? "" : "s"}.
        </p>
      </div>
    </div>
  );
}
