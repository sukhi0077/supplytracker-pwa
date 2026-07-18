// src/components/InvoiceView.jsx
// Read-only view of one invoice + its lines.
import Modal from "./ui/Modal.jsx";
import { useInvoice } from "../hooks/useCatalogue.js";
import { Loading, ErrorBox, Pill } from "./ui/parts.jsx";

const money = (v) => (v == null ? "" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 }));

export default function InvoiceView({ open, onClose, invoiceId }) {
  const { data, isLoading, error } = useInvoice(invoiceId);

  return (
    <Modal open={open} onClose={onClose} title={data ? `Invoice ${data.number}` : "Invoice"} wide>
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading || !data ? (
        <Loading label="Loading invoice…" />
      ) : (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-400">Supplier</div>
              <div className="font-medium">{data.supplierName}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Issued</div>
              <div className="font-medium">{data.issue_date}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Status</div>
              <Pill value={data.status} />
            </div>
            <div>
              <div className="text-xs text-slate-400">Gross</div>
              <div className="font-semibold">{money(data.gross_total)} {data.currency}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Item / line</th>
                  <th className="px-3 py-2 font-semibold text-right">Qty</th>
                  <th className="px-3 py-2 font-semibold text-right">Net/unit</th>
                  <th className="px-3 py-2 font-semibold text-right">VAT%</th>
                  <th className="px-3 py-2 font-semibold text-right">Gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.lines || []).map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 text-slate-400">{l.line_no}</td>
                    <td className="px-3 py-2">{l.item?.name || l.ksef_item_name_raw}</td>
                    <td className="px-3 py-2 text-right">{l.quantity} {l.unit}</td>
                    <td className="px-3 py-2 text-right">{money(l.net_unit)}</td>
                    <td className="px-3 py-2 text-right">{l.vat_rate ?? ""}</td>
                    <td className="px-3 py-2 text-right font-medium">{money(l.gross_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
