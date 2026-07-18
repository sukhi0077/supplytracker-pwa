// src/pages/SalesReport.jsx
// Upload a monthly sales report (JSON or CSV) into the shared sales_records
// table. Idempotent on (month, category, item_name).
import { useMemo, useState } from "react";
import { useSales, useImportSales } from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox, Empty } from "../components/ui/parts.jsx";
import { Field, Text, Btn } from "../components/ui/form.jsx";

const money = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

// Minimal CSV parser (handles quoted fields + commas).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const pick = (o, ...keys) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== "") return o[k];
  return undefined;
};

// Normalize any record object to the sales_records shape.
function normalize(rec, fallbackMonth) {
  const month = String(pick(rec, "month", "Month", "MONTH") ?? fallbackMonth ?? "").slice(0, 7);
  return {
    month,
    category: String(pick(rec, "category", "Category") ?? ""),
    item_name: String(pick(rec, "item_name", "itemName", "item", "Item", "name") ?? ""),
    status: String(pick(rec, "status", "Status") ?? ""),
    units: Math.round(Number(pick(rec, "units", "Units", "qty", "quantity") ?? 0)) || 0,
    revenue: Number(pick(rec, "revenue", "Revenue", "sales", "amount") ?? 0) || 0,
  };
}

export default function SalesReport({ isAdmin }) {
  const [month, setMonth] = useState("");
  const sales = useSales(month || undefined);
  const importSales = useImportSales();
  const [fallbackMonth, setFallbackMonth] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const onFile = async (e) => {
    setError(""); setMsg(""); setParsed(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let records = [];
      if (file.name.endsWith(".json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
        const json = JSON.parse(text);
        records = Array.isArray(json) ? json : json.records || json.rows || json.items || [];
      } else {
        const rows = parseCsv(text);
        const header = rows[0].map((h) => h.trim());
        records = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
      }
      const norm = records.map((r) => normalize(r, fallbackMonth)).filter((r) => r.month && r.item_name);
      if (!norm.length) return setError("No usable rows found. Need month + item_name (a Month field or set the fallback month).");
      setParsed(norm);
    } catch (err) {
      setError(err.message || "Couldn't parse the file.");
    }
  };

  const doImport = async () => {
    if (!parsed) return;
    setError(""); setMsg("");
    try {
      const n = await importSales.mutateAsync(parsed);
      setMsg(`Imported ${n} rows.`);
      setParsed(null);
    } catch (e) {
      setError(e.message || "Import failed.");
    }
  };

  const totals = useMemo(() => {
    const list = sales.data || [];
    return {
      units: list.reduce((s, r) => s + (r.units || 0), 0),
      revenue: list.reduce((s, r) => s + Number(r.revenue || 0), 0),
    };
  }, [sales.data]);

  return (
    <div>
      <PageHeader title="Sales report" subtitle="Upload monthly sales; stored in the shared sales_records table." />

      {isAdmin && (
        <Card className="mb-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Upload JSON or CSV" className="sm:col-span-2">
              <input type="file" accept=".json,.csv" onChange={onFile} className="block w-full text-sm" />
            </Field>
            <Field label="Fallback month" hint="Used if rows have no Month column.">
              <Text type="month" value={fallbackMonth} onChange={setFallbackMonth} />
            </Field>
          </div>
          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {msg && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
          {parsed && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-slate-600">{parsed.length} rows ready.</span>
              <Btn variant="primary" onClick={doImport} disabled={importSales.isPending}>
                {importSales.isPending ? "Importing…" : `Import ${parsed.length} rows`}
              </Btn>
            </div>
          )}
        </Card>
      )}

      <div className="mb-4 flex items-center gap-3">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        {month && (
          <button onClick={() => setMonth("")} className="text-sm text-slate-500 underline">
            clear
          </button>
        )}
        <span className="ml-auto text-sm text-slate-500">
          {totals.units.toLocaleString()} units · {money(totals.revenue)} revenue
        </span>
      </div>

      {sales.error ? (
        <ErrorBox error={sales.error} />
      ) : sales.isLoading ? (
        <Loading label="Loading sales…" />
      ) : (sales.data || []).length === 0 ? (
        <Card className="p-2"><Empty>No sales records{month ? " for this month" : ""} yet.</Empty></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Month</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold text-right">Units</th>
                  <th className="px-4 py-3 font-semibold text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(sales.data || []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 text-slate-500">{r.month}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.category}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{r.item_name}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{r.units}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{money(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
