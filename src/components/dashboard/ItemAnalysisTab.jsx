// src/components/dashboard/ItemAnalysisTab.jsx
// One item, everything about it: how the price moved, how often you buy it,
// how much you buy, and which supplier is actually cheapest.
//
// Two price series are plotted because they answer different questions:
//   • per invoice unit — what the supplier billed (matches the paper invoice)
//   • per base unit    — unit price ÷ pack size, so a 10 kg sack and a 1 kg bag
//                        are comparable. A jump in one but not the other means
//                        the pack changed, not the price.
import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, BarChart,
} from "recharts";
import { Card, Empty } from "../ui/parts.jsx";
import ItemPicker from "../ui/ItemPicker.jsx";
import ItemTrendTable from "./ItemTrendTable.jsx";
import { ChartCard, Kpi, BarList, money0, money2, moneyUnit, qty, monthLabel } from "./common.jsx";

const dayLabel = (d) => (d || "").slice(5); // MM-DD — the year is on the range picker

export default function ItemAnalysisTab({ lines, invoiceById, itemMap, itemOptions }) {
  const [itemId, setItemId] = useState(null);
  const detailRef = useRef(null);

  // Picking a row in the table above should carry you down to the detail —
  // otherwise the page looks like nothing happened.
  const pickAndScroll = useCallback((id) => {
    setItemId(id);
    requestAnimationFrame(() =>
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, []);

  // Only offer items that actually appear in this period — picking an item with
  // no purchases is a dead end.
  const purchasedIds = useMemo(() => new Set(lines.filter((l) => l.itemId).map((l) => l.itemId)), [lines]);
  const options = useMemo(() => {
    const withData = itemOptions.filter((o) => purchasedIds.has(o.id));
    return withData.length ? withData : itemOptions;
  }, [itemOptions, purchasedIds]);

  const model = useMemo(() => {
    if (!itemId) return null;
    const rows = lines
      .filter((l) => l.itemId === itemId)
      .map((l) => {
        const inv = invoiceById.get(l.invoiceId);
        return {
          ...l,
          date: inv?.issueDate || "",
          invoiceNumber: inv?.number || "",
          supplierName: inv?.supplierName || "—",
          supplierId: inv?.supplierId || null,
        };
      })
      .filter((r) => r.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!rows.length) return { rows: [] };

    const spend = rows.reduce((s, r) => s + r.net, 0);
    const grossSpend = rows.reduce((s, r) => s + r.gross, 0);
    const baseQty = rows.reduce((s, r) => s + (r.baseQuantity || 0), 0);
    const orders = new Set(rows.map((r) => r.invoiceId)).size;

    const priced = rows.filter((r) => r.netPerBase != null && r.netPerBase > 0);
    const prices = priced.map((r) => r.netPerBase);
    const first = priced[0]?.netPerBase ?? null;
    const last = priced[priced.length - 1]?.netPerBase ?? null;
    // Weighted average is the honest "what did it really cost me" number —
    // a plain mean over-weights one-off small purchases.
    const avg = baseQty ? spend / baseQty : null;

    // Order cadence: mean gap between distinct purchase dates.
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    let cadence = null;
    if (dates.length > 1) {
      const span = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000;
      cadence = span / (dates.length - 1);
    }

    // Price series — one point per purchase date (weighted mean if a date has
    // several lines, e.g. two invoices the same day).
    const byDate = new Map();
    for (const r of rows) {
      if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, qtyBase: 0, qtyInv: 0, net: 0, netUnitW: 0, netBaseW: 0 });
      const d = byDate.get(r.date);
      d.net += r.net;
      d.qtyBase += r.baseQuantity || 0;
      d.qtyInv += r.quantity || 0;
      if (r.netUnit != null) d.netUnitW += r.netUnit * (r.quantity || 1);
      if (r.netPerBase != null) d.netBaseW += r.netPerBase * (r.baseQuantity || 1);
    }
    const series = [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        label: dayLabel(d.date),
        perUnit: d.qtyInv ? +(d.netUnitW / d.qtyInv).toFixed(2) : null,
        perBase: d.qtyBase ? +(d.netBaseW / d.qtyBase).toFixed(2) : null,
        qtyBase: +d.qtyBase.toFixed(3),
        net: Math.round(d.net),
      }));

    // Monthly volume + spend.
    const byMonth = new Map();
    for (const r of rows) {
      const ym = r.date.slice(0, 7);
      if (!byMonth.has(ym)) byMonth.set(ym, { ym, qtyBase: 0, net: 0, orders: new Set() });
      const m = byMonth.get(ym);
      m.qtyBase += r.baseQuantity || 0;
      m.net += r.net;
      m.orders.add(r.invoiceId);
    }
    const monthly = [...byMonth.values()]
      .sort((a, b) => a.ym.localeCompare(b.ym))
      .map((m) => ({ label: monthLabel(m.ym), qtyBase: +m.qtyBase.toFixed(2), net: Math.round(m.net), orders: m.orders.size }));

    // Per-supplier comparison, on the pack-adjusted price.
    const bySupplier = new Map();
    for (const r of rows) {
      const k = r.supplierName;
      if (!bySupplier.has(k)) bySupplier.set(k, { name: k, net: 0, qtyBase: 0, orders: new Set(), last: null, lastDate: "" });
      const s = bySupplier.get(k);
      s.net += r.net;
      s.qtyBase += r.baseQuantity || 0;
      s.orders.add(r.invoiceId);
      if (r.netPerBase != null && r.date >= s.lastDate) { s.last = r.netPerBase; s.lastDate = r.date; }
    }
    const suppliers = [...bySupplier.values()]
      .map((s) => ({ ...s, avgBase: s.qtyBase ? s.net / s.qtyBase : null, orders: s.orders.size }))
      .sort((a, b) => (a.avgBase ?? Infinity) - (b.avgBase ?? Infinity));

    // Packs seen — a changing pack size is the usual explanation for a price step.
    const packs = [...new Set(rows.map((r) => r.packSize))].sort((a, b) => a - b);

    return {
      rows: [...rows].reverse(), // table shows newest first
      spend, grossSpend, baseQty, orders, cadence, series, monthly, suppliers, packs,
      first, last, avg,
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      change: first && last ? (last - first) / first : null,
      lastDate: dates[dates.length - 1],
      unit: rows[rows.length - 1]?.unit || "",
    };
  }, [itemId, lines, invoiceById]);

  const info = itemId ? itemMap.get(itemId) : null;
  const baseUnit = info?.unit || "base unit";

  return (
    <div className="space-y-4">
      {/* Every item at a glance — three lines per row. Clicking a row loads it
          into the detail view below. */}
      <ChartCard title="All items — quantity, gross and unit price">
        <ItemTrendTable
          lines={lines}
          invoiceById={invoiceById}
          itemMap={itemMap}
          onPickItem={pickAndScroll}
        />
      </ChartCard>

      <div ref={detailRef} className="scroll-mt-4" />
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Item</span>
            <ItemPicker
              value={itemId}
              onChange={setItemId}
              options={options}
              placeholder="— pick an item —"
              title="Choose item to analyse"
            />
          </div>
          {info && (
            <div className="self-end text-xs text-slate-500">
              {info.category || "Uncategorised"}
              {info.subCategory ? ` › ${info.subCategory}` : ""}
              {info.unit ? ` · priced per ${info.unit}` : ""}
              {model?.packs?.length > 1 && (
                <span className="ml-1 text-amber-600">· pack sizes seen: {model.packs.join(", ")}</span>
              )}
            </div>
          )}
        </div>
      </Card>

      {!itemId ? (
        <Card className="p-8">
          <Empty>Pick an item to see its price history, order frequency and supplier comparison.</Empty>
        </Card>
      ) : !model?.rows?.length ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          No purchases of this item in the selected period. Widen the date range, or check it's mapped in{" "}
          <Link to="/invoice-details" className="text-teal-600 underline">Invoice details</Link>.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Times ordered" value={model.orders} sub={model.cadence ? `every ~${Math.round(model.cadence)} days` : "single order"} tone="teal" />
            <Kpi label="Total spend" value={money0(model.spend)} sub={`net · ${money0(model.grossSpend)} gross`} />
            <Kpi label="Quantity" value={qty(model.baseQty)} sub={baseUnit} />
            <Kpi label="Avg price" value={moneyUnit(model.avg)} sub={`per ${baseUnit}, weighted`} />
            <Kpi label="Latest price" value={moneyUnit(model.last)} sub={model.lastDate} />
            <Kpi
              label="Price change"
              value={model.change == null ? "—" : `${model.change > 0 ? "+" : ""}${(model.change * 100).toFixed(1)}%`}
              sub={`${moneyUnit(model.min)} – ${moneyUnit(model.max)}`}
              tone={model.change == null ? "slate" : model.change > 0.02 ? "red" : model.change < -0.02 ? "green" : "slate"}
            />
          </div>

          <ChartCard
            title="Price over time (net)"
            right={<span className="text-[11px] text-slate-400">bars = quantity bought</span>}
          >
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={model.series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="price" tick={{ fontSize: 11 }} width={52} tickFormatter={(v) => v.toFixed(2)} />
                <YAxis yAxisId="qty" orientation="right" tick={{ fontSize: 11 }} width={44} />
                <Tooltip
                  formatter={(v, n) => (n === "Quantity" ? `${qty(v)} ${baseUnit}` : moneyUnit(v))}
                  labelFormatter={(l, p) => p?.[0]?.payload?.date || l}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="qty" dataKey="qtyBase" name="Quantity" fill="#e2e8f0" radius={[3, 3, 0, 0]} />
                <Line yAxisId="price" type="monotone" dataKey="perBase" name={`Per ${baseUnit}`} stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line yAxisId="price" type="monotone" dataKey="perUnit" name="Per invoice unit" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
            {model.packs.length > 1 && (
              <p className="mt-2 text-xs text-amber-600">
                Pack size varies ({model.packs.join(", ")}) — where the two lines diverge, the pack changed rather than the price.
              </p>
            )}
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="How much, how often (per month)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={model.monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={44} />
                  <Tooltip
                    formatter={(v, n) => (n === "Spend" ? money2(v) : n === "Orders" ? v : `${qty(v)} ${baseUnit}`)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="qtyBase" name="Quantity" fill="#0d9488" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="orders" name="Orders" fill="#7c3aed" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Suppliers — cheapest first" right={<span className="text-[11px] text-slate-400">avg per {baseUnit}</span>}>
              <BarList
                rows={model.suppliers.map((s) => ({
                  key: s.name,
                  name: s.name,
                  value: s.avgBase || 0,
                  sub: `${s.orders} order${s.orders === 1 ? "" : "s"} · ${qty(s.qtyBase)} ${baseUnit} · ${money0(s.net)} · last ${moneyUnit(s.last)}`,
                }))}
                format={moneyUnit}
                emptyLabel="No supplier data."
              />
              {model.suppliers.length > 1 && model.suppliers[0].avgBase > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Switching everything to <strong>{model.suppliers[0].name}</strong> at its average price would have cost{" "}
                  {money0(model.suppliers[0].avgBase * model.baseQty)} instead of {money0(model.spend)} —
                  a difference of{" "}
                  <strong className={model.spend - model.suppliers[0].avgBase * model.baseQty > 0 ? "text-emerald-600" : "text-slate-600"}>
                    {money0(Math.max(0, model.spend - model.suppliers[0].avgBase * model.baseQty))}
                  </strong>
                  .
                </p>
              )}
            </ChartCard>
          </div>

          <ChartCard title={`Every purchase (${model.rows.length} line${model.rows.length === 1 ? "" : "s"})`}>
            <div className="max-h-96 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Date</th>
                    <th className="py-2 pr-3 font-semibold">Invoice</th>
                    <th className="py-2 pr-3 font-semibold">Supplier</th>
                    <th className="py-2 pr-3 text-right font-semibold">Qty</th>
                    <th className="py-2 pr-3 text-right font-semibold">Pack</th>
                    <th className="py-2 pr-3 text-right font-semibold">Unit price</th>
                    <th className="py-2 pr-3 text-right font-semibold">Per {baseUnit}</th>
                    <th className="py-2 text-right font-semibold">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {model.rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap py-1.5 pr-3 text-slate-500">{r.date}</td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-slate-600">{r.invoiceNumber}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{r.supplierName}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{qty(r.quantity)} {r.unit}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-400">{qty(r.packSize)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{moneyUnit(r.netUnit)}</td>
                      <td className="py-1.5 pr-3 text-right font-medium tabular-nums text-slate-800">{moneyUnit(r.netPerBase)}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">{money2(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}
