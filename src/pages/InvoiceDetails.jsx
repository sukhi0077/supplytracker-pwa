// src/pages/InvoiceDetails.jsx
// Line-level view of fetched invoices (matches the original SupplyTracker
// "Invoice Details"): every invoice LINE with the catalogue item it maps to,
// ranked fuzzy suggestions with a confidence %, and a remap confirm dialog
// (pack size + "save as KSeF mapping for this supplier").
import { useMemo, useState } from "react";
import {
  useInvoiceLines,
  useItems,
  useMappings,
  useSuppliers,
  useSetLineItem,
  useRemapLine,
  useAddMapping,
} from "../hooks/useCatalogue.js";
import { buildSuggester } from "../utils/ksefMatch.js";
import { PageHeader, Card, Loading, ErrorBox, Empty } from "../components/ui/parts.jsx";
import Modal from "../components/ui/Modal.jsx";
import { Field, Btn } from "../components/ui/form.jsx";

const money = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 }));
const num = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString());

export default function InvoiceDetails({ isAdmin }) {
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [q, setQ] = useState("");

  const { data, isLoading, error } = useInvoiceLines({ unmappedOnly });
  const { data: items } = useItems();
  const { data: mappings } = useMappings();
  const { data: suppliers } = useSuppliers();
  const setLineItem = useSetLineItem();
  const remap = useRemapLine();
  const addMapping = useAddMapping();

  // Remap confirm dialog state.
  const [pending, setPending] = useState(null); // { row, itemId, packSize, saveMapping }
  const [pendingErr, setPendingErr] = useState("");

  const itemOptions = useMemo(
    () => (items || []).filter((i) => i.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  const suggest = useMemo(() => {
    if (!items) return null;
    return buildSuggester({ items, mappings: mappings || [], suppliers: suppliers || [] });
  }, [items, mappings, suppliers]);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return data || [];
    return (data || []).filter(
      (r) =>
        r.ksefItemName.toLowerCase().includes(n) ||
        r.itemName.toLowerCase().includes(n) ||
        r.invoiceNumber.toLowerCase().includes(n) ||
        r.supplierName.toLowerCase().includes(n),
    );
  }, [data, q]);

  const unmappedCount = (data || []).filter((r) => !r.itemId).length;

  const suggestionsByLine = useMemo(() => {
    if (!suggest) return {};
    const out = {};
    for (const r of rows) {
      if (r.itemId) continue;
      out[r.id] = suggest(r.ksefItemName, {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        supplierKsefName: r.supplierKsefName,
      });
    }
    return out;
  }, [rows, suggest]);

  const pct = (s) => `${Math.round(s * 100)}%`;
  const viaTone = {
    mapping: "bg-emerald-100 text-emerald-700 border-emerald-200",
    keyword: "bg-teal-100 text-teal-700 border-teal-200",
    name: "bg-sky-100 text-sky-700 border-sky-200",
    catalogue: "bg-slate-100 text-slate-600 border-slate-200",
    supplier: "bg-violet-100 text-violet-700 border-violet-200",
  };

  // Picking an item opens the confirm dialog; clearing a mapping is immediate.
  const openRemap = (row, itemId) => {
    setPendingErr("");
    if (!itemId) {
      setLineItem.mutate({ lineId: row.id, itemId: null });
      return;
    }
    setPending({
      row,
      itemId,
      packSize: String(parseFloat(row.packSize || 1) || 1),
      saveMapping: !!row.ksefItemName,
    });
  };

  const confirmRemap = async () => {
    if (!pending) return;
    const { row, itemId, packSize, saveMapping } = pending;
    setPendingErr("");
    try {
      await remap.mutateAsync({ lineId: row.id, patch: { itemId, packSize } });
      if (saveMapping && row.ksefItemName && itemId) {
        try {
          await addMapping.mutateAsync({
            ksefItemName: row.ksefItemName,
            itemId,
            supplierId: row.supplierId || null,
            packSize: Number(packSize) || 1,
          });
        } catch {
          /* a mapping for this (name, supplier) may already exist — fine */
        }
      }
      setPending(null);
    } catch (e) {
      setPendingErr(e.message || "Save failed.");
    }
  };

  const pendItem = pending ? (items || []).find((i) => i.id === pending.itemId) : null;
  const busy = remap.isPending || addMapping.isPending;

  return (
    <div>
      <PageHeader
        title="Invoice details"
        subtitle="Every invoice line and the catalogue item it maps to. Map the unmapped ones here."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search KSeF text, item, invoice, supplier…"
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={unmappedOnly} onChange={(e) => setUnmappedOnly(e.target.checked)} />
          Unmapped only {unmappedCount ? `(${unmappedCount})` : ""}
        </label>
      </div>

      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Loading label="Loading invoice lines…" />
      ) : rows.length === 0 ? (
        <Card className="p-2">
          <Empty>
            {unmappedOnly ? "No unmapped lines — everything is mapped." : "No invoice lines yet. Fetch invoices from Download KSeF."}
          </Empty>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Invoice</th>
                  <th className="px-3 py-3 font-semibold">Supplier</th>
                  <th className="px-3 py-3 font-semibold">KSeF line text</th>
                  <th className="px-3 py-3 font-semibold text-right">Qty</th>
                  <th className="px-3 py-3 font-semibold text-right">Net</th>
                  <th className="px-3 py-3 font-semibold text-right">Gross</th>
                  <th className="px-3 py-3 font-semibold">Mapped item</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className={r.itemId ? "" : "bg-amber-50/40"}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.issueDate}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.invoiceNumber}</td>
                    <td className="px-3 py-2 text-slate-600">{r.supplierName}</td>
                    <td className="px-3 py-2 text-slate-800">{r.ksefItemName}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{num(r.quantity)} {r.unit}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{money(r.netTotal)}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">{money(r.grossTotal)}</td>
                    <td className="px-3 py-2">
                      {isAdmin ? (
                        <div className="min-w-[200px] space-y-1">
                          {!r.itemId && (suggestionsByLine[r.id] || []).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {(suggestionsByLine[r.id] || []).map((s) => (
                                <button
                                  key={s.itemId}
                                  onClick={() => openRemap(r, s.itemId)}
                                  title={`${s.via} match — click to review & confirm`}
                                  className={`rounded-full border px-2 py-0.5 text-xs hover:brightness-95 ${viaTone[s.via] || viaTone.catalogue}`}
                                >
                                  {s.itemName} <span className="font-semibold">{pct(s.score)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <select
                            value={r.itemId || ""}
                            onChange={(e) => openRemap(r, e.target.value || null)}
                            className={`w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 ${
                              r.itemId ? "border-slate-300" : "border-amber-300 bg-amber-50"
                            }`}
                          >
                            <option value="">— unmapped —</option>
                            {itemOptions.map((it) => (
                              <option key={it.id} value={it.id}>{it.name}</option>
                            ))}
                          </select>
                        </div>
                      ) : r.itemName ? (
                        <span className="text-slate-800">{r.itemName}</span>
                      ) : (
                        (() => {
                          const best = (suggestionsByLine[r.id] || [])[0];
                          return best ? (
                            <span className="text-amber-700">unmapped · maybe {best.itemName} ({pct(best.score)})</span>
                          ) : (
                            <span className="text-amber-600">unmapped</span>
                          );
                        })()
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-2 text-xs text-slate-400">
        {rows.length} line{rows.length === 1 ? "" : "s"}. Suggestions are ranked by a confidence score; click one (or
        pick from the list) to review and confirm.
      </p>

      {/* Remap confirm dialog */}
      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="Map line to item"
        footer={
          <>
            <Btn onClick={() => setPending(null)}>Cancel</Btn>
            <Btn variant="primary" onClick={confirmRemap} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Btn>
          </>
        }
      >
        {pending && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <div className="text-xs text-slate-400">KSeF line</div>
              <div className="font-medium text-slate-800 break-words">{pending.row.ksefItemName || "—"}</div>
              <div className="mt-1 text-slate-500">
                → <span className="font-semibold text-slate-800">{pendItem?.name || "?"}</span>
                {pendItem?.defaultUnit ? <span className="ml-1 text-slate-400">· unit: {pendItem.defaultUnit}</span> : null}
              </div>
            </div>

            <Field label="Pack size — base units per invoice unit (e.g. 10 for a 10 kg sack of a kg item)">
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={pending.packSize}
                onChange={(e) => setPending({ ...pending, packSize: e.target.value })}
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </Field>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={pending.saveMapping}
                disabled={!pending.row.ksefItemName}
                onChange={(e) => setPending({ ...pending, saveMapping: e.target.checked })}
                className="mt-0.5"
              />
              <span>
                Save as KSeF mapping for <strong>{pending.row.supplierName || "this supplier"}</strong> — future fetches
                of this line text map automatically (recommended).
              </span>
            </label>

            <p className="text-xs text-slate-400">
              This updates the invoice line so the mapping survives re-fetches.
            </p>
            {pendingErr && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pendingErr}</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
