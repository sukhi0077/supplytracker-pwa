// src/pages/InvoiceDetails.jsx
// Line-level view of fetched invoices (matches the original SupplyTracker
// "Invoice Details"): every invoice LINE with the catalogue item it maps to,
// ranked fuzzy suggestions with a confidence %, and a remap confirm dialog
// (pack size + "save as KSeF mapping for this supplier").
import { useMemo, useState } from "react";
import {
  useInvoiceLines,
  useItems,
  useMasterData,
  useMappings,
  useSuppliers,
  useSetLineItem,
  useRemapLine,
  useAddMapping,
} from "../hooks/useCatalogue.js";
import { buildSuggester } from "../utils/ksefMatch.js";
import { PageHeader, Card, Loading, ErrorBox, Empty } from "../components/ui/parts.jsx";
import Modal from "../components/ui/Modal.jsx";
import ItemPicker from "../components/ui/ItemPicker.jsx";
import { Field, Btn, Decimal, parseDecimal } from "../components/ui/form.jsx";

// Money is 2dp; quantities and pack sizes keep their own precision.
const FMT = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const money = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString(undefined, FMT));
const num = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString());

export default function InvoiceDetails({ isAdmin }) {
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [q, setQ] = useState("");

  const { data, isLoading, error } = useInvoiceLines({ unmappedOnly });
  const { data: items } = useItems();
  const { data: master } = useMasterData();
  const { data: mappings } = useMappings();
  const { data: suppliers } = useSuppliers();

  // Resolve unit codes by id (items store unit as a FK after normalization).
  const unitCodeById = useMemo(() => new Map((master?.units || []).map((u) => [u.id, u.code])), [master]);
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
    // Fractional packs are legitimate (a 0.2 kg tub of a kg item), so the only
    // rule is "a positive number" — never silently fall back to 1.
    const pack = parseDecimal(packSize);
    if (pack == null || pack <= 0) {
      setPendingErr("Pack size must be a number greater than 0 (e.g. 0.2, 1, 10).");
      return;
    }
    try {
      await remap.mutateAsync({ lineId: row.id, patch: { itemId, packSize: pack } });
      if (saveMapping && row.ksefItemName && itemId) {
        try {
          await addMapping.mutateAsync({
            ksefItemName: row.ksefItemName,
            itemId,
            supplierId: row.supplierId || null,
            packSize: pack,
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
  const pendUnit = pendItem
    ? unitCodeById.get(pendItem.unitId) || unitCodeById.get(pendItem.defaultUomId) || pendItem.defaultUnit || ""
    : "";
  const busy = remap.isPending || addMapping.isPending;

  // The map control (chips + dropdown), reused by the desktop table and mobile cards.
  const renderMapControl = (r) => {
    if (!isAdmin) {
      if (r.itemName) return <span className="text-sm text-slate-800">{r.itemName}</span>;
      const best = (suggestionsByLine[r.id] || [])[0];
      return best ? (
        <span className="text-sm text-amber-700">unmapped · maybe {best.itemName} ({pct(best.score)})</span>
      ) : (
        <span className="text-sm text-amber-600">unmapped</span>
      );
    }
    return (
      <div className="space-y-1.5">
        {!r.itemId && (suggestionsByLine[r.id] || []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(suggestionsByLine[r.id] || []).map((s) => (
              <button
                key={s.itemId}
                onClick={() => openRemap(r, s.itemId)}
                title={`${s.via} match — tap to review & confirm`}
                className={`rounded-full border px-2 py-1 text-xs hover:brightness-95 ${viaTone[s.via] || viaTone.catalogue}`}
              >
                {s.itemName} <span className="font-semibold">{pct(s.score)}</span>
              </button>
            ))}
          </div>
        )}
        <ItemPicker
          value={r.itemId || null}
          onChange={(itemId) => openRemap(r, itemId)}
          options={itemOptions}
          title="Choose catalogue item"
        />
      </div>
    );
  };

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
        <>
          {/* Desktop / tablet: table */}
          <Card className="hidden overflow-hidden md:block">
            {/* table-fixed with explicit widths: the columns previously sized
                themselves to their content, so one long KSeF description pushed
                the table past the card and forced horizontal scrolling. Long
                text now wraps inside its column instead. */}
            <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed text-sm">
              <colgroup>
                <col className="w-[92px]" />
                <col className="w-[120px]" />
                <col className="w-[12%]" />
                <col />
                <col className="w-[96px]" />
                <col className="w-[92px]" />
                <col className="w-[92px]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Invoice</th>
                  <th className="px-3 py-3 font-semibold">Supplier</th>
                  <th className="px-3 py-3 font-semibold">KSeF line text</th>
                  <th className="px-3 py-3 text-right font-semibold">Qty</th>
                  <th className="px-3 py-3 text-right font-semibold">Net</th>
                  <th className="px-3 py-3 text-right font-semibold">Gross</th>
                  <th className="px-3 py-3 font-semibold">Mapped item</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className={r.itemId ? "" : "bg-amber-50/40"}>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-slate-500">{r.issueDate}</td>
                    <td className="px-3 py-2 align-top text-slate-600"><span className="block truncate" title={r.invoiceNumber}>{r.invoiceNumber}</span></td>
                    <td className="px-3 py-2 align-top text-slate-600"><span className="block truncate" title={r.supplierName}>{r.supplierName}</span></td>
                    <td className="break-words px-3 py-2 align-top text-slate-800">{r.ksefItemName}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right align-top text-slate-600">{num(r.quantity)} {r.unit}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right align-top text-slate-600">{money(r.netTotal)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right align-top font-medium text-slate-800">{money(r.grossTotal)}</td>
                    <td className="px-3 py-2 align-top">{renderMapControl(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>

          {/* Mobile: stacked cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`rounded-xl border p-3 ${r.itemId ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50/50"}`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span className="whitespace-nowrap">{r.invoiceNumber} · {r.issueDate}</span>
                  <span className="truncate text-right">{r.supplierName}</span>
                </div>
                <div className="mt-1 break-words text-sm font-medium text-slate-800">{r.ksefItemName}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span>Qty {num(r.quantity)} {r.unit}</span>
                  <span>Net {money(r.netTotal)}</span>
                  <span className="font-medium text-slate-700">Gross {money(r.grossTotal)}</span>
                </div>
                <div className="mt-2">{renderMapControl(r)}</div>
              </div>
            ))}
          </div>
        </>
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
            {/* From → to, stacked on mobile so neither side gets squeezed. */}
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">KSeF line</div>
              <div className="break-words font-medium text-slate-800">{pending.row.ksefItemName || "—"}</div>
              <div className="my-1.5 text-slate-300">↓</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Catalogue item</div>
              <div className="break-words font-semibold text-slate-800">{pendItem?.name || "?"}</div>
              {pendUnit ? <div className="text-xs text-slate-400">unit: {pendUnit}</div> : null}
            </div>

            {/* Let them correct the target without closing the dialog. */}
            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">Item</span>
              <ItemPicker
                value={pending.itemId}
                onChange={(itemId) => itemId && setPending({ ...pending, itemId })}
                options={itemOptions}
                title="Choose catalogue item"
              />
            </div>

            <Field label="Pack size" hint="Base units per invoice unit — e.g. 10 for a 10 kg sack of a kg item.">
              <Decimal
                value={pending.packSize}
                onChange={(v) => setPending({ ...pending, packSize: v })}
                placeholder="1"
                className="sm:w-32"
              />
            </Field>

            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={pending.saveMapping}
                disabled={!pending.row.ksefItemName}
                onChange={(e) => setPending({ ...pending, saveMapping: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="min-w-0">
                Save as KSeF mapping for <strong className="break-words">{pending.row.supplierName || "this supplier"}</strong> — future
                fetches of this line text map automatically (recommended).
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
