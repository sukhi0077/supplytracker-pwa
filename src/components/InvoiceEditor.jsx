// src/components/InvoiceEditor.jsx
// Manual invoice entry: header + line items. Totals are computed from the lines.
import { useEffect, useMemo, useState } from "react";
import Modal from "./ui/Modal.jsx";
import { Field, Text, Num, Select, Btn } from "./ui/form.jsx";
import { useSuppliers, useItems, useInvoice, useCreateInvoice, useUpdateInvoiceFull } from "../hooks/useCatalogue.js";
import { round2or } from "../utils/number.js";

const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = () => ({
  item_id: null,
  ksef_item_name_raw: "",
  quantity: 1,
  unit: "szt",
  net_unit: 0,
  vat_rate: 5,
});

const r2 = round2or;

export default function InvoiceEditor({ open, onClose, invoiceId = null }) {
  const isEdit = !!invoiceId;
  const { data: suppliers } = useSuppliers();
  const { data: items } = useItems();
  const create = useCreateInvoice();
  const updateFull = useUpdateInvoiceFull();
  const { data: loaded } = useInvoice(isEdit ? invoiceId : null);

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

  // On open: preload the invoice when editing, else start blank.
  useEffect(() => {
    if (!open) return;
    if (isEdit && loaded) {
      setSupplierId(loaded.supplier_id || null);
      setNumber(loaded.number || "");
      setIssueDate(loaded.issue_date || today());
      setCurrency(loaded.currency || "PLN");
      const mapped = (loaded.lines || []).map((l) => ({
        item_id: l.item_id || null,
        ksef_item_name_raw: l.ksef_item_name_raw || "",
        quantity: Number(l.quantity ?? 0),
        unit: l.unit || "szt",
        net_unit: Number(l.net_unit ?? 0),
        vat_rate: Number(l.vat_rate ?? 0),
      }));
      setLines(mapped.length ? mapped : [emptyLine()]);
      setError("");
    } else if (!isEdit) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, loaded]);

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
        status: isEdit ? loaded?.status || "manual" : "manual",
      };
      const dbLines = lines.map((l, i) => ({
        line_no: i + 1,
        item_id: l.item_id || null,
        ksef_item_name_raw:
          l.ksef_item_name_raw || (items || []).find((it) => it.id === l.item_id)?.name || "",
        quantity: Number(l.quantity || 0),
        unit: l.unit || "szt",
        net_unit: r2(l.net_unit),
        vat_rate: Number(l.vat_rate || 0),
        net_total: computed[i].net,
        vat_amount: computed[i].vat,
        gross_total: computed[i].gross,
      }));
      if (isEdit) {
        await updateFull.mutateAsync({ id: invoiceId, header, lines: dbLines });
      } else {
        await create.mutateAsync({ header, lines: dbLines });
        reset();
      }
      onClose();
    } catch (e) {
      setError(e.message || "Save failed.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit invoice" : "New invoice"}
      wide
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={create.isPending || updateFull.isPending}>
            {create.isPending || updateFull.isPending ? "Saving…" : isEdit ? "Save changes" : "Save invoice"}
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
            <div key={i} className="rounded-xl border border-slate-200 p-2.5">
              {/* Row 1: item picker (full width on mobile) + remove */}
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Select
                    value={l.item_id}
                    onChange={(v) => setLine(i, { item_id: v })}
                    options={(items || []).map((it) => ({ value: it.id, label: it.name }))}
                    placeholder="Item (optional)…"
                  />
                </div>
                <button
                  onClick={() => removeLine(i)}
                  className="mt-0.5 shrink-0 rounded-md border border-slate-200 px-2.5 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                  disabled={lines.length === 1}
                  aria-label="Remove line"
                >
                  ✕
                </button>
              </div>

              {/* Row 2: qty / net / vat with labels */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-slate-500">Qty</span>
                  <Num value={l.quantity} onChange={(v) => setLine(i, { quantity: v })} placeholder="1" />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-slate-500">Net / unit</span>
                  <Num value={l.net_unit} onChange={(v) => setLine(i, { net_unit: v })} placeholder="0.00" />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-slate-500">VAT %</span>
                  <Num value={l.vat_rate} onChange={(v) => setLine(i, { vat_rate: v })} placeholder="5" />
                </label>
              </div>

              {/* Row 3: line gross */}
              <div className="mt-1.5 text-right text-xs text-slate-500">
                Line gross <b className="text-slate-800">{computed[i].gross.toFixed(2)}</b>
              </div>

              {!l.item_id && (
                <div className="mt-1.5">
                  <Text
                    value={l.ksef_item_name_raw}
                    onChange={(v) => setLine(i, { ksef_item_name_raw: v })}
                    placeholder="Line description (when no item picked)"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
          <span className="text-slate-500">Net <b className="text-slate-800">{totals.net.toFixed(2)}</b></span>
          <span className="text-slate-500">VAT <b className="text-slate-800">{totals.vat.toFixed(2)}</b></span>
          <span className="text-slate-500">Gross <b className="text-slate-900">{totals.gross.toFixed(2)} {currency}</b></span>
        </div>
      </div>
    </Modal>
  );
}
