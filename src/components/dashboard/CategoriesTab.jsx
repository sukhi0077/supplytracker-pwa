// src/components/dashboard/CategoriesTab.jsx
// Spend broken down by category, drilling into sub-categories and the items
// inside them. Lines whose item isn't mapped yet land in an "Unmapped" bucket
// so the totals always reconcile with the invoices.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  AreaChart, Area, CartesianGrid, XAxis, YAxis,
} from "recharts";
import { Card } from "../ui/parts.jsx";
import { COLORS, ChartCard, BarList, Kpi, money0, money2, monthLabel, qty } from "./common.jsx";

const UNMAPPED = "__unmapped__";

export default function CategoriesTab({ lines, invoiceById, itemMap }) {
  const [catKey, setCatKey] = useState(null); // drill-down selection
  const [subKey, setSubKey] = useState(null);

  const model = useMemo(() => {
    const cats = new Map(); // key -> { key, name, value, lines, items:Map, subs:Map, byMonth:Map }

    const touch = (map, key, name) => {
      if (!map.has(key)) map.set(key, { key, name, value: 0, lines: 0, qty: 0 });
      return map.get(key);
    };

    for (const l of lines) {
      const info = l.itemId ? itemMap.get(l.itemId) : null;
      const catK = info ? info.categoryId || "__none__" : UNMAPPED;
      const catN = info ? info.category || "Uncategorised" : "Unmapped";

      if (!cats.has(catK)) {
        cats.set(catK, { key: catK, name: catN, value: 0, lines: 0, qty: 0, subs: new Map(), items: new Map(), byMonth: new Map() });
      }
      const c = cats.get(catK);
      c.value += l.gross;
      c.lines += 1;
      c.qty += l.baseQuantity || 0;

      const subK = info ? info.subCategoryId || "__none__" : UNMAPPED;
      const subN = info ? info.subCategory || "(no sub-category)" : "Unmapped";
      const s = touch(c.subs, subK, subN);
      s.value += l.gross;
      s.lines += 1;

      const itemK = l.itemId || `ksef:${l.ksefName || "(blank)"}`;
      const itemN = info ? info.name : l.ksefName || "(unnamed line)";
      const it = touch(c.items, itemK, itemN);
      it.value += l.gross;
      it.lines += 1;
      it.subKey = subK;

      const ym = (invoiceById.get(l.invoiceId)?.issueDate || "").slice(0, 7);
      if (ym) c.byMonth.set(ym, (c.byMonth.get(ym) || 0) + l.gross);
    }

    const list = [...cats.values()].sort((a, b) => b.value - a.value);
    const total = list.reduce((s, c) => s + c.value, 0);
    return { list, byKey: cats, total };
  }, [lines, invoiceById, itemMap]);

  const selected = catKey ? model.byKey.get(catKey) : null;

  // Pie keeps the long tail readable by folding everything past 8 into "Other".
  const pieData = useMemo(() => {
    const top = model.list.slice(0, 8).map((c) => ({ name: c.name, value: Math.round(c.value) }));
    const rest = model.list.slice(8).reduce((s, c) => s + c.value, 0);
    if (rest > 0) top.push({ name: "Other", value: Math.round(rest) });
    return top;
  }, [model.list]);

  const share = (v) => (model.total ? `${((v / model.total) * 100).toFixed(1)}%` : "—");

  if (!model.list.length) {
    return <Card className="p-8 text-center text-sm text-slate-500">No invoice lines in this period.</Card>;
  }

  // ---- drill-down view -----------------------------------------------------
  if (selected) {
    const subs = [...selected.subs.values()].sort((a, b) => b.value - a.value);
    const items = [...selected.items.values()]
      .filter((it) => !subKey || it.subKey === subKey)
      .sort((a, b) => b.value - a.value);
    const monthly = [...selected.byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, v]) => ({ label: monthLabel(ym), gross: Math.round(v) }));
    const subName = subKey ? subs.find((s) => s.key === subKey)?.name : null;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button onClick={() => { setCatKey(null); setSubKey(null); }} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            ← All categories
          </button>
          <span className="font-semibold text-slate-800">{selected.name}</span>
          {subName && (
            <>
              <span className="text-slate-300">/</span>
              <span className="text-slate-600">{subName}</span>
              <button onClick={() => setSubKey(null)} className="text-xs text-teal-600 underline">clear</button>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Spend" value={money0(selected.value)} sub={`${share(selected.value)} of total`} tone="teal" />
          <Kpi label="Invoice lines" value={selected.lines} />
          <Kpi label="Sub-categories" value={selected.subs.size} />
          <Kpi label="Items" value={selected.items.size} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Sub-categories" right={<span className="text-[11px] text-slate-400">tap to filter items</span>}>
            <BarList
              rows={subs.map((s) => ({ ...s, sub: `${s.lines} line${s.lines === 1 ? "" : "s"} · ${share(s.value)}` }))}
              onPick={(r) => setSubKey(r.key === subKey ? null : r.key)}
            />
          </ChartCard>

          <ChartCard title={`Spend over time — ${selected.name}`}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => money2(v)} />
                <Area type="monotone" dataKey="gross" name="Spend" stroke="#0d9488" strokeWidth={2} fill="#0d948820" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title={subName ? `Items in ${subName}` : `Items in ${selected.name}`}>
          <div className="max-h-96 overflow-y-auto">
            <BarList
              rows={items.map((it) => ({ ...it, sub: `${it.lines} line${it.lines === 1 ? "" : "s"}` }))}
              emptyLabel="No items in this sub-category."
            />
          </div>
        </ChartCard>
      </div>
    );
  }

  // ---- top-level view ------------------------------------------------------
  const unmapped = model.byKey.get(UNMAPPED);

  return (
    <div className="space-y-4">
      {unmapped && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {money0(unmapped.value)} ({share(unmapped.value)}) sits on lines with no catalogue item — map them in{" "}
          <Link to="/invoice-details" className="underline">Invoice details</Link> to see it here.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spend by category">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => money2(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Categories" right={<span className="text-[11px] text-slate-400">tap to drill in</span>}>
          <div className="max-h-72 overflow-y-auto">
            <BarList
              rows={model.list.map((c) => ({
                ...c,
                sub: `${share(c.value)} · ${c.subs.size} sub · ${c.items.size} item${c.items.size === 1 ? "" : "s"}`,
              }))}
              onPick={(r) => { setCatKey(r.key); setSubKey(null); }}
            />
          </div>
        </ChartCard>
      </div>

      <ChartCard title="All sub-categories">
        <div className="max-h-96 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-3 font-semibold">Category</th>
                <th className="py-2 pr-3 font-semibold">Sub-category</th>
                <th className="py-2 pr-3 text-right font-semibold">Lines</th>
                <th className="py-2 text-right font-semibold">Gross</th>
              </tr>
            </thead>
            <tbody>
              {model.list.flatMap((c) =>
                [...c.subs.values()]
                  .sort((a, b) => b.value - a.value)
                  .map((s) => (
                    <tr
                      key={`${c.key}:${s.key}`}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => { setCatKey(c.key); setSubKey(s.key); }}
                    >
                      <td className="py-1.5 pr-3 text-slate-500">{c.name}</td>
                      <td className="py-1.5 pr-3 font-medium text-slate-800">{s.name}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">{qty(s.lines)}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700">{money0(s.value)}</td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
