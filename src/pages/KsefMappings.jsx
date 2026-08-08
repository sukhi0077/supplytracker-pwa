// src/pages/KsefMappings.jsx
import { useEffect, useMemo, useState } from "react";
import {
  useMappings,
  useItems,
  useSuppliers,
  useAddMapping,
  useUpdateMapping,
  useRemoveMapping,
  useApplyMappingToLines,
} from "../hooks/useCatalogue.js";
import { KsefMappingRepository, CATCH_ALL, isCatchAll } from "../repositories/KsefMappingRepository.js";
import { PageHeader, Card, Loading, ErrorBox, Empty } from "../components/ui/parts.jsx";
import { SortTh } from "../components/SortTh.jsx";
import { useSort } from "../hooks/useSort.js";
import { Field, Text, Select, Btn, Decimal, parseDecimal } from "../components/ui/form.jsx";
import Modal from "../components/ui/Modal.jsx";

function Editor({ open, onClose, mapping }) {
  const isEdit = !!mapping;
  const { data: items } = useItems();
  const { data: suppliers } = useSuppliers();
  const add = useAddMapping();
  const update = useUpdateMapping();
  const applyToLines = useApplyMappingToLines();
  const [form, setForm] = useState({ ksefItemName: "", itemId: null, supplierId: null, packSize: 1 });
  const [error, setError] = useState("");
  // Existing invoice lines this mapping would rewrite. Mappings are applied at
  // fetch time, so without this a mapping edit leaves old invoices untouched
  // and the dashboard keeps reporting the previous item.
  const [backfill, setBackfill] = useState(true);
  const [matchCount, setMatchCount] = useState(null);

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

  const catchAll = isCatchAll(form.ksefItemName);
  const setCatchAll = (on) => setForm((f) => ({ ...f, ksefItemName: on ? CATCH_ALL : "" }));

  // Count affected lines as the name / supplier settle. Debounced so typing a
  // name doesn't fire a query per keystroke.
  useEffect(() => {
    if (!open || !form.ksefItemName.trim()) {
      setMatchCount(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const lines = await KsefMappingRepository.findMatchingLines({
          ksefItemName: form.ksefItemName,
          supplierId: form.supplierId,
        });
        if (alive) setMatchCount(lines.length);
      } catch {
        if (alive) setMatchCount(null);
      }
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [open, form.ksefItemName, form.supplierId]);

  const save = async () => {
    setError("");
    if (catchAll && !form.supplierId) {
      return setError("A catch-all needs a supplier — otherwise it would swallow every line from everyone.");
    }
    if (!catchAll && !form.ksefItemName.trim()) return setError("KSeF item text is required.");
    if (!form.itemId) return setError("Pick the catalogue item.");
    const pack = parseDecimal(form.packSize);
    if (pack == null || pack <= 0) return setError("Pack size must be a number greater than 0 (e.g. 0.2, 1, 10).");
    const payload = { ...form, packSize: pack };
    try {
      if (isEdit) await update.mutateAsync({ id: mapping.id, patch: payload });
      else await add.mutateAsync(payload);
      if (backfill && matchCount > 0) {
        await applyToLines.mutateAsync({
          ksefItemName: payload.ksefItemName,
          itemId: payload.itemId,
          supplierId: payload.supplierId || null,
          packSize: pack,
        });
      }
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
        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={catchAll}
            onChange={(e) => setCatchAll(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="min-w-0">
            Every line from this supplier maps to this item
            <span className="mt-0.5 block text-[11px] text-slate-400">
              For utilities and services — an ENEA invoice words the same electricity differently every month. Text
              mappings still win where they match.
            </span>
          </span>
        </label>

        {!catchAll && (
          <Field label="KSeF item text" hint="Raw item name as it appears on the invoice.">
            <Text value={form.ksefItemName} onChange={set("ksefItemName")} />
          </Field>
        )}
        <Field label="Catalogue item">
          <Select value={form.itemId} onChange={set("itemId")} options={(items || []).map((it) => ({ value: it.id, label: it.name }))} placeholder="Pick…" />
        </Field>
        <Field
          label={catchAll ? "Supplier *" : "Supplier"}
          hint={catchAll ? "Required — the catch-all applies to this supplier only." : "Leave blank for a global mapping (any supplier)."}
        >
          <Select value={form.supplierId} onChange={set("supplierId")} options={(suppliers || []).map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
        <Field label="Pack size" hint="Base units per invoice unit — e.g. 10 for a 10 kg sack, or 0.2 for a 200 g tub.">
          <Decimal value={form.packSize} onChange={set("packSize")} placeholder="1" />
        </Field>

        {/* Mappings only apply as invoices are fetched, so without this the
            change affects nothing you've already imported. */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          {matchCount == null ? (
            <p className="text-xs text-slate-400">Checking existing invoice lines…</p>
          ) : matchCount === 0 ? (
            <p className="text-xs text-slate-500">
              No invoice lines already imported with this text — the mapping applies to future fetches only.
            </p>
          ) : (
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={backfill}
                onChange={(e) => setBackfill(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="min-w-0">
                Also update <strong>{matchCount}</strong> invoice line{matchCount === 1 ? "" : "s"} already imported with
                this text.
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  Without this, dashboard figures keep using the old mapping. Any manual per-line remap of these lines
                  will be overwritten.
                </span>
              </span>
            </label>
          )}
        </div>
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

  // Item first — it's what you scan for; the raw KSeF text is the detail.
  const { sorted, sort } = useSort(rows, { key: "itemName" });

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
                  <SortTh label="Item" field="itemName" sort={sort} className="px-4 py-3" />
                  <SortTh label="KSeF text" field="ksefItemName" sort={sort} className="px-4 py-3" />
                  <SortTh label="Supplier" field="supplierName" sort={sort} className="px-4 py-3" />
                  <SortTh label="Pack" field="packSize" sort={sort} align="right" className="px-4 py-3" />
                  {isAdmin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{m.itemName}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {isCatchAll(m.ksefItemName) ? (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                          any line from this supplier
                        </span>
                      ) : (
                        m.ksefItemName
                      )}
                    </td>
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
