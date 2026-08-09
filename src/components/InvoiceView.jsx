// src/components/InvoiceView.jsx
// Read-only view of one invoice + its lines.
import Modal from "./ui/Modal.jsx";
import { useInvoice } from "../hooks/useCatalogue.js";
import { Loading, ErrorBox, Pill } from "./ui/parts.jsx";

const money = (v) => (v == null ? "" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const num = (v) => (v == null || v === "" ? "" : Number(v).toLocaleString());

// `highlightItemId` / `highlightLineId` mark the line you arrived from, so
// opening an invoice doesn't leave you hunting for the row you were looking at.
// The line id is the precise one — it also works for lines with no item yet,
// which is exactly the case when you're arriving from an unmapped row.
export default function InvoiceView({
  open,
  onClose,
  invoiceId,
  highlightItemId = null,
  highlightLineId = null,
}) {
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
            <div className="col-span-2">
              <div className="text-xs text-slate-400">Supplier</div>
              <div className="font-medium">{data.supplierName}</div>
              {/* The legal name on the KSeF invoice, when it isn't the same as
                  the curated one — worth seeing to confirm the right match. */}
              {data.supplierKsefName && data.supplierKsefName !== data.supplierName && (
                <div className="text-xs text-slate-500" title="Legal name as it appears on the KSeF invoice">
                  KSeF: {data.supplierKsefName}
                </div>
              )}
              {data.supplierNip && <div className="text-[11px] text-slate-400">NIP {data.supplierNip}</div>}
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
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold text-right">Qty</th>
                  <th className="px-3 py-2 font-semibold text-right">Net/unit</th>
                  <th className="px-3 py-2 font-semibold text-right">Net</th>
                  <th className="px-3 py-2 font-semibold text-right">VAT%</th>
                  <th className="px-3 py-2 font-semibold text-right">Gross</th>
                  <th className="px-3 py-2 font-semibold">KSeF name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.lines || []).map((l) => (
                  <tr
                    key={l.id}
                    className={
                      (highlightLineId && l.id === highlightLineId) ||
                      (!highlightLineId && highlightItemId && l.item_id === highlightItemId)
                        ? "bg-teal-50"
                        : ""
                    }
                  >
                    <td className="px-3 py-2 text-slate-400">{l.line_no}</td>
                    {/* An unmapped line reads as "—" rather than falling back to
                        the KSeF text, which made it look mapped to a catalogue
                        item that doesn't exist. The raw text has its own column
                        now, so nothing is lost. */}
                    <td className="px-3 py-2">
                      {l.item?.name || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{num(l.quantity)} {l.unit}</td>
                    <td className="px-3 py-2 text-right">{money(l.net_unit)}</td>
                    <td className="px-3 py-2 text-right">{money(l.net_total)}</td>
                    <td className="px-3 py-2 text-right">{l.vat_rate ?? ""}</td>
                    <td className="px-3 py-2 text-right font-medium">{money(l.gross_total)}</td>
                    <td className="px-3 py-2 text-slate-500">{l.ksef_item_name_raw || "—"}</td>
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
