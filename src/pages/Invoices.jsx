// src/pages/Invoices.jsx
import { useMemo, useState } from "react";
import { useInvoices } from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox, Empty, Pill } from "../components/ui/parts.jsx";
import { Btn } from "../components/ui/form.jsx";
import { DateRangeBar, useDateRange } from "../components/ui/DateRangeBar.jsx";
import InvoiceEditor from "../components/InvoiceEditor.jsx";
import InvoiceView from "../components/InvoiceView.jsx";

const money = (v, ccy = "PLN") =>
  v == null ? "" : `${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;

export default function Invoices({ isAdmin }) {
  const { data, isLoading, error } = useInvoices();
  const [q, setQ] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editInvoiceId, setEditInvoiceId] = useState(null); // null = new
  const [viewId, setViewId] = useState(null);

  const openNew = () => { setEditInvoiceId(null); setEditorOpen(true); };
  const openEdit = (id) => { setEditInvoiceId(id); setEditorOpen(true); };
  // Only manually-entered invoices (no KSeF reference) are editable.
  const isManual = (i) => !i.ksef_reference;

  // Same control as the dashboard, filtering on issue_date. Comparing the ISO
  // date strings directly is safe — they're zero-padded, so lexical order is
  // chronological order, and it avoids re-parsing every row into a Date.
  const range = useDateRange("month");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data || []).filter((i) => {
      const d = i.issue_date || "";
      if (range.from && d && d < range.from) return false;
      if (range.to && d && d > range.to) return false;
      return (
        !needle ||
        (i.number || "").toLowerCase().includes(needle) ||
        (i.supplierName || "").toLowerCase().includes(needle)
      );
    });
  }, [data, q, range.from, range.to]);

  const total = useMemo(() => rows.reduce((s, i) => s + Number(i.gross_total || 0), 0), [rows]);

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Supplier invoices in the shared database." />

      {/* What you're looking at on the left, the action on the right. Both are
          the same height — the stepper's "md" size matches Btn. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <DateRangeBar range={range} presets={false} />
        {isAdmin && <Btn variant="primary" onClick={openNew}>+ New invoice</Btn>}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {rows.length
            ? `${rows.length} invoice${rows.length === 1 ? "" : "s"} · ${money(total)}`
            : "Nothing in this period."}
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search number or supplier…"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Loading label="Loading invoices…" />
      ) : rows.length === 0 ? (
        <Card className="p-2">
          <Empty>
            {(data || []).length
              ? "No invoices in this period — try a wider range."
              : "No invoices yet. Fetch them from Download KSeF, or add one manually."}
          </Empty>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Number</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Issued</th>
                  <th className="px-4 py-3 font-semibold text-right">Net</th>
                  <th className="px-4 py-3 font-semibold text-right">Gross</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {isAdmin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((i) => (
                  <tr
                    key={i.id}
                    onClick={() => setViewId(i.id)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5 font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:decoration-teal-600">{i.number}</td>
                    <td className="px-4 py-2.5 text-slate-600">{i.supplierName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{i.issue_date}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {money(i.net_total, i.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                      {money(i.gross_total, i.currency)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Pill value={i.status} />
                    </td>
                    {isAdmin && (
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        {isManual(i) ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(i.id); }}
                            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50"
                          >
                            Edit
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400" title="Fetched from KSeF — edit in KSeF, not here">KSeF</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isAdmin && (
        <InvoiceEditor open={editorOpen} onClose={() => setEditorOpen(false)} invoiceId={editInvoiceId} />
      )}
      <InvoiceView open={!!viewId} onClose={() => setViewId(null)} invoiceId={viewId} />
    </div>
  );
}
