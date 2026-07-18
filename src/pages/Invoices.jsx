// src/pages/Invoices.jsx
import { useMemo, useState } from "react";
import { useInvoices } from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox, Empty, Pill } from "../components/ui/parts.jsx";
import { Btn } from "../components/ui/form.jsx";
import InvoiceEditor from "../components/InvoiceEditor.jsx";
import InvoiceView from "../components/InvoiceView.jsx";

const money = (v, ccy = "PLN") =>
  v == null ? "" : `${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${ccy}`;

export default function Invoices({ isAdmin }) {
  const { data, isLoading, error } = useInvoices();
  const [q, setQ] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewId, setViewId] = useState(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data || []).filter(
      (i) =>
        !needle ||
        (i.number || "").toLowerCase().includes(needle) ||
        (i.supplierName || "").toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Supplier invoices in the shared database."
        right={isAdmin && <Btn variant="primary" onClick={() => setEditorOpen(true)}>+ New invoice</Btn>}
      />

      <div className="mb-4">
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
            No invoices yet. Auto-fetch from KSeF arrives in the Workers phase; manual entry is
            coming next.
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((i) => (
                  <tr
                    key={i.id}
                    onClick={() => setViewId(i.id)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-900">{i.number}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isAdmin && <InvoiceEditor open={editorOpen} onClose={() => setEditorOpen(false)} />}
      <InvoiceView open={!!viewId} onClose={() => setViewId(null)} invoiceId={viewId} />
    </div>
  );
}
