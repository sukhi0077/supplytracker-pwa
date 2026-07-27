// src/pages/Stock.jsx
import { useMemo, useState } from "react";
import {
  useStockLevels,
  useStockMovements,
  useItems,
  useAddMovement,
} from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox, Empty, Pill } from "../components/ui/parts.jsx";
import { Field, Text, Num, Select, Btn } from "../components/ui/form.jsx";
import Modal from "../components/ui/Modal.jsx";

const today = () => new Date().toISOString().slice(0, 10);
const KINDS = [
  "purchase_in",
  "sale_out",
  "waste",
  "transfer",
  "adjustment",
  "prep",
  "opening",
  "count",
];

function AdjustModal({ open, onClose }) {
  const { data: items } = useItems();
  const add = useAddMovement();
  const [form, setForm] = useState({ itemId: null, qty: 0, kind: "adjustment", happenedAt: today(), notes: "" });
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setError("");
    if (!form.itemId) return setError("Pick an item.");
    if (!form.qty) return setError("Quantity can't be zero.");
    try {
      await add.mutateAsync(form);
      onClose();
      setForm({ itemId: null, qty: 0, kind: "adjustment", happenedAt: today(), notes: "" });
    } catch (e) {
      setError(e.message || "Save failed.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Stock movement"
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
        <Field label="Item" className="col-span-2">
          <Select value={form.itemId} onChange={set("itemId")} options={(items || []).map((it) => ({ value: it.id, label: it.name }))} placeholder="Pick…" />
        </Field>
        <Field label="Qty (signed)" hint="+ into stock, − out">
          <Num value={form.qty} onChange={set("qty")} />
        </Field>
        <Field label="Kind">
          <Select value={form.kind} onChange={set("kind")} options={KINDS.map((k) => ({ value: k, label: k }))} placeholder="adjustment" />
        </Field>
        <Field label="Date">
          <Text type="date" value={form.happenedAt} onChange={set("happenedAt")} />
        </Field>
        <Field label="Notes">
          <Text value={form.notes} onChange={set("notes")} />
        </Field>
      </div>
    </Modal>
  );
}

export default function Stock({ isAdmin }) {
  const levels = useStockLevels();
  const movements = useStockMovements();
  const [q, setQ] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (levels.data || []).filter((s) => !n || s.itemName.toLowerCase().includes(n));
  }, [levels.data, q]);

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="Current levels per item — maintained by stock movements (DB trigger)."
        right={isAdmin && <Btn variant="primary" onClick={() => setAdjustOpen(true)}>+ Movement</Btn>}
      />

      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search item…"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {levels.error ? (
            <ErrorBox error={levels.error} />
          ) : levels.isLoading ? (
            <Loading label="Loading stock…" />
          ) : rows.length === 0 ? (
            <Card className="p-2"><Empty>No stock levels recorded yet.</Empty></Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Item</th>
                      <th className="px-4 py-3 font-semibold text-right">On hand</th>
                      <th className="px-4 py-3 font-semibold text-right">Reorder</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((s) => (
                      <tr key={s.item_id}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{s.itemName}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">
                          {Number(s.current_qty).toLocaleString()} {s.itemUnit}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{s.reorder_point ?? ""}</td>
                        <td className="px-4 py-2.5"><Pill value={s.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Recent movements
          </div>
          <div className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
            {(movements.data || []).length === 0 ? (
              <Empty>No movements yet.</Empty>
            ) : (
              (movements.data || []).map((m) => (
                <div key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{m.itemName}</div>
                    <div className="text-xs text-slate-400">
                      {m.happened_at} · {m.kind}
                    </div>
                  </div>
                  <div className={`ml-2 font-semibold ${Number(m.qty) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {Number(m.qty) >= 0 ? "+" : ""}
                    {m.qty}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {isAdmin && <AdjustModal open={adjustOpen} onClose={() => setAdjustOpen(false)} />}
    </div>
  );
}
