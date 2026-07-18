// src/pages/InvoiceDetails.jsx
// The purchase / orders log (Django InvoiceDetail) -> shared invoice_details.
import { useMemo, useState } from "react";
import {
  useOrderLog,
  useSuppliers,
  useItems,
  useAddOrderLine,
  useRemoveOrderLine,
} from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox, Empty } from "../components/ui/parts.jsx";
import { Field, Text, Num, Select, Btn } from "../components/ui/form.jsx";
import Modal from "../components/ui/Modal.jsx";

const today = () => new Date().toISOString().slice(0, 10);
const money = (v) => (v == null ? "" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 }));

function AddLine({ open, onClose }) {
  const { data: suppliers } = useSuppliers();
  const { data: items } = useItems();
  const add = useAddOrderLine();
  const [row, setRow] = useState({ orderDate: today(), supplierId: null, itemId: null, quantity: 1, unitPriceNet: null });
  const [error, setError] = useState("");
  const set = (k) => (v) => setRow((r) => ({ ...r, [k]: v }));

  const save = async () => {
    setError("");
    if (!row.supplierId) return setError("Pick a supplier.");
    try {
      const lineTotalNet =
        row.quantity != null && row.unitPriceNet != null
          ? Math.round(Number(row.quantity) * Number(row.unitPriceNet) * 100) / 100
          : null;
      await add.mutateAsync({ ...row, lineTotalNet });
      onClose();
      setRow({ orderDate: today(), supplierId: null, itemId: null, quantity: 1, unitPriceNet: null });
    } catch (e) {
      setError(e.message || "Save failed.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add order line"
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={add.isPending}>
            {add.isPending ? "Saving…" : "Save"}
          </Btn>
        </>
      }
    >
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Text type="date" value={row.orderDate} onChange={set("orderDate")} />
        </Field>
        <Field label="Supplier">
          <Select value={row.supplierId} onChange={set("supplierId")} options={(suppliers || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="Pick…" />
        </Field>
        <Field label="Item" className="col-span-2">
          <Select value={row.itemId} onChange={set("itemId")} options={(items || []).map((it) => ({ value: it.id, label: it.name }))} placeholder="(unmapped)" />
        </Field>
        <Field label="Quantity">
          <Num value={row.quantity} onChange={set("quantity")} />
        </Field>
        <Field label="Unit price (net)">
          <Num value={row.unitPriceNet} onChange={set("unitPriceNet")} />
        </Field>
      </div>
    </Modal>
  );
}

export default function InvoiceDetails({ isAdmin }) {
  const { data, isLoading, error } = useOrderLog();
  const remove = useRemoveOrderLine();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data || []).filter(
      (r) => !n || r.itemName.toLowerCase().includes(n) || r.supplierName.toLowerCase().includes(n),
    );
  }, [data, q]);

  return (
    <div>
      <PageHeader
        title="Invoice details"
        subtitle="Purchase / orders log — one row per purchased line."
        right={isAdmin && <Btn variant="primary" onClick={() => setAddOpen(true)}>+ Add line</Btn>}
      />

      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search item or supplier…"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Loading label="Loading order log…" />
      ) : rows.length === 0 ? (
        <Card className="p-2"><Empty>No order lines yet.</Empty></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold text-right">Qty</th>
                  <th className="px-4 py-3 font-semibold text-right">Net total</th>
                  {isAdmin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 text-slate-600">{r.orderDate}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{r.itemName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.supplierName}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{r.quantity} {r.unit}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{money(r.lineTotalNet)}</td>
                    {isAdmin && (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => remove.mutate(r.id)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isAdmin && <AddLine open={addOpen} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
