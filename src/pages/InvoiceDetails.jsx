// src/pages/InvoiceDetails.jsx
// Line-level view of fetched invoices (matches the original SupplyTracker
// "Invoice Details"): every invoice LINE with the catalogue item it mapped to,
// so unmapped KSeF lines can be searched and mapped. Data comes from
// invoice_lines (populated by the KSeF fetch), not the orders-log table.
import { useMemo, useState } from "react";
import {
  useInvoiceLines,
  useItems,
  useSetLineItem,
  useAddMapping,
} from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox, Empty } from "../components/ui/parts.jsx";

const money = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 }));
const num = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString());

export default function InvoiceDetails({ isAdmin }) {
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [q, setQ] = useState("");
  const [saveMapping, setSaveMapping] = useState(true);

  const { data, isLoading, error } = useInvoiceLines({ unmappedOnly });
  const { data: items } = useItems();
  const setLineItem = useSetLineItem();
  const addMapping = useAddMapping();

  const itemOptions = useMemo(
    () => (items || []).filter((i) => i.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

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

  const mapLine = async (row, itemId) => {
    await setLineItem.mutateAsync({ lineId: row.id, itemId });
    // Optionally teach the mapping so future fetches auto-map this KSeF text.
    if (saveMapping && itemId && row.ksefItemName) {
      try {
        await addMapping.mutateAsync({ ksefItemName: row.ksefItemName, itemId });
      } catch {
        /* mapping may already exist — ignore */
      }
    }
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
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={saveMapping} onChange={(e) => setSaveMapping(e.target.checked)} />
            Also save as KSeF mapping
          </label>
        )}
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
                        <select
                          value={r.itemId || ""}
                          onChange={(e) => mapLine(r, e.target.value || null)}
                          className={`w-full min-w-[180px] rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 ${
                            r.itemId ? "border-slate-300" : "border-amber-300 bg-amber-50"
                          }`}
                        >
                          <option value="">— unmapped —</option>
                          {itemOptions.map((it) => (
                            <option key={it.id} value={it.id}>{it.name}</option>
                          ))}
                        </select>
                      ) : r.itemName ? (
                        <span className="text-slate-800">{r.itemName}</span>
                      ) : (
                        <span className="text-amber-600">unmapped</span>
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
        {rows.length} line{rows.length === 1 ? "" : "s"}. Mapping a line here updates the invoice line; “save as KSeF
        mapping” also teaches future fetches to auto-map that supplier text.
      </p>
    </div>
  );
}
