// src/components/InvoiceEditor.jsx
// Manual invoice entry: header + line items. Totals are computed from the lines.
import { useMemo, useState } from "react";
import Modal from "./ui/Modal.jsx";
import { Field, Text, Num, Select, Btn } from "./ui/form.jsx";
import { useSuppliers, useItems, useCreateInvoice } from "../hooks/useCatalogue.js";

const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = () => ({
  item_id: null,
  ksef_item_name_raw: "",
  quantity: 1,
  unit: "szt",
  net_unit: 0,
  vat_rate: 23,
});

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export default function InvoiceEditor({ open, onClose }) {
  const { data: suppliers } = useSuppliers();
  const { data: items } = useItems();
  const create = useCreateInvoice();

  const [supplierId, setSupplierId] = useState(null);
  const [number, setNumber] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [currency, setCurrency] = useState("PLN");
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState("");

  const reset = () => {
    setSupplierId(null);
    setNumber("");
    setIssueDate(today());
    setCurrency("PLN");
    setLines([emptyLine()]);
    setError("");
  };

  const setLine = (i, patch) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (i) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const computed = useMemo(() => {
    return lines.map((l) => {
      const net = r2(Number(l.quantity || 0) * Number(l.net_unit || 0));
      const vat = r2((net * Number(l.vat_rate || 0)) / 100);
      return { net, vat, gross: r2(net + vat) };
    });
  }, [lines]);

  const totals = useMemo(() => {
    const net = r2(computed.reduce((s, c) => s + c.net, 0));
    const vat = r2(computed.reduce((s, c) => s + c.vat, 0));
    return { net, vat, gross: r2(net + vat) };
  }, [computed]);

  const save = async () => {
    setError("");
    if (!supplierId) return setError("Pick a supplier.");
    if (!number.trim()) return setError("Invoice number is required.");
    try {
      const header = {
        supplier_id: supplierId,
        number: number.trim(),
        issue_date: issueDate,
        currency,
        net_total: totals.net,
        vat_total: totals.vat,
        gross_total: totals.gross,
        status: "draft",
      };
      const dbLines = lines.map((l, i) => ({
        line_no: i + 1,
        item_id: l.item_id || null,
        ksef_item_name_raw:
          l.ksef_item_name_raw || (items || []).find((it) => it.id === l.item_id)?.name || "",
        quantity: Number(l.quantity || 0),
        unit: l.unit || "szt",
        net_unit: Number(l.net_unit || 0),
        vat_rate: Number(l.vat_rate || 0),
        net_total: computed[i].net,
        vat_amount: computed[i].vat,
        gross_total: computed[i].gross,
      }));
      await create.mutateAsync({ header, lines: dbLines });
      reset();
      onClose();
    } catch (e) {
      setError(e.message || "Save failed.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New invoice"
      wide
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Save invoice"}
          </Btn>
        </>
      }
    >
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Supplier" className="sm:col-span-2">
          <Select
            value={supplierId}
            onChange={setSupplierId}
            options={(suppliers || []).map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Pick supplier…"
          />
        </Field>
        <Field label="Number">
          <Text value={number} onChange={setNumber} placeholder="FV/2026/..." />
        </Field>
        <Field label="Issue date">
          <Text value={issueDate} onChange={setIssueDate} type="date" />
        </Field>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Lines</h3>
          <Btn onClick={addLine}>+ Add line</Btn>
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <Select
                    value={l.item_id}
                    onChange={(v) => setLine(i, { item_id: v })}
                    options={(items || []).map((it) => ({ value: it.id, label: it.name }))}
                    placeholder="Item (optional)…"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Num value={l.quantity} onChange={(v) => setLine(i, { quantity: v })} placeholder="Qty" />
                </div>
                <div className="sm:col-span-2">
                  <Num value={l.net_unit} onChange={(v) => setLine(i, { net_unit: v })} placeholder="Net/unit" />
                </div>
                <div className="sm:col-span-2">
                  <Num value={l.vat_rate} onChange={(v) => setLine(i, { vat_rate: v })} placeholder="VAT%" />
                </div>
                <div className="flex items-center justify-end sm:col-span-2">
                  <span className="mr-2 text-xs text-slate-500">{computed[i].gross.toFixed(2)}</span>
                  <button
                    onClick={() => removeLine(i)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    disabled={lines.length === 1}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {!l.item_id && (
                <div className="mt-2">
                  <Text
                    value={l.ksef_item_name_raw}
                    onChange={(v) => setLine(i, { ksef_item_name_raw: v })}
                    placeholder="Raw line description (when no item picked)"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex justify-end gap-6 text-sm">
          <span className="text-slate-500">Net <b className="text-slate-800">{totals.net.toFixed(2)}</b></span>
          <span className="text-slate-500">VAT <b className="text-slate-800">{totals.vat.toFixed(2)}</b></span>
          <span className="text-slate-500">Gross <b className="text-slate-900">{totals.gross.toFixed(2)} {currency}</b></span>
        </div>
      </div>
    </Modal>
  );
}
