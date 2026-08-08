// src/pages/Dashboard.jsx
// Purchasing analytics from the KSeF-fetched invoices, in three tabs:
//   Overview       — KPIs, spend over time, top suppliers/items, stock health
//   Categories     — spend by category, drilling into sub-categories and items
//   Item analysis  — one item's price history, order cadence and suppliers
// All three share the date-range presets and a single analytics query.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area,
} from "recharts";
import {
  useItems,
  useMasterData,
  useSuppliers,
  useStockLevels,
  usePurchaseAnalytics,
} from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox } from "../components/ui/parts.jsx";
import { COLORS, Kpi, ChartCard, BarList, money0, money2, monthLabel } from "../components/dashboard/common.jsx";
import CategoriesTab from "../components/dashboard/CategoriesTab.jsx";
import ItemAnalysisTab from "../components/dashboard/ItemAnalysisTab.jsx";

// Local calendar date, NOT toISOString().slice(0,10). toISOString converts to
// UTC first, so in Poland (UTC+1/+2) the 1st of the month at 00:00 local came
// back as the last day of the PREVIOUS month — which would have quietly broken
// the month presets below, and already made "today" wrong before ~01:00/02:00.
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// `anchor` is { y, m } — the month the navigator is pointing at.
function rangeFor(preset, anchor) {
  const now = new Date();
  const to = iso(now);
  const y = now.getFullYear();
  const m = now.getMonth();

  if (preset === "month") {
    const a = anchor || { y, m };
    const isCurrent = a.y === y && a.m === m;
    return {
      from: iso(new Date(a.y, a.m, 1)),
      // Day 0 of the next month is the last day of this one. The current month
      // stops at today rather than running into the future.
      to: isCurrent ? to : iso(new Date(a.y, a.m + 1, 0)),
    };
  }
  if (preset === "ytd") return { from: `${y}-01-01`, to };
  const n = { "3m": 3, "6m": 6 }[preset] ?? 3;
  return { from: iso(new Date(y, m - n, now.getDate())), to };
}

const PRESETS = [
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "custom", label: "Custom" },
];

const monthName = (a) =>
  new Date(a.y, a.m, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "categories", label: "Categories" },
  { key: "items", label: "Item analysis" },
];

export default function Dashboard() {
  const [preset, setPreset] = useState("month");
  const [tab, setTab] = useState("overview");
  // Custom range seeds from the last 12 months so the inputs open on something
  // sensible rather than empty.
  const [customFrom, setCustomFrom] = useState(() => rangeFor("3m").from);
  const [customTo, setCustomTo] = useState(() => iso(new Date()));
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // Can't step past the current month — there's nothing there.
  const nowRef = new Date();
  const atCurrentMonth = anchor.y === nowRef.getFullYear() && anchor.m === nowRef.getMonth();
  const stepMonth = (delta) => {
    setPreset("month");
    setAnchor((a) => {
      const d = new Date(a.y, a.m + delta, 1);
      const n = new Date();
      if (d > new Date(n.getFullYear(), n.getMonth(), 1)) return a;
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const { from, to } = useMemo(() => {
    if (preset !== "custom") return rangeFor(preset, anchor);
    // Tolerate the dates being entered the wrong way round.
    const a = customFrom || undefined;
    const b = customTo || undefined;
    if (a && b && a > b) return { from: b, to: a };
    return { from: a, to: b };
  }, [preset, customFrom, customTo, anchor]);

  const analytics = usePurchaseAnalytics(from, to);
  const items = useItems();
  const master = useMasterData();
  const suppliers = useSuppliers();
  const stock = useStockLevels();

  // Items store category / sub-category / unit as FKs and useItems() returns
  // blank name strings, so the names have to be resolved here from master data.
  // (Before this, every line fell through to "Uncategorised".)
  const itemMap = useMemo(() => {
    const catName = new Map((master.data?.categories || []).map((c) => [c.id, c.name]));
    const subName = new Map((master.data?.subCategories || []).map((s) => [s.id, s.name]));
    const unitCode = new Map((master.data?.units || []).map((u) => [u.id, u.code]));
    const m = new Map();
    for (const it of items.data || []) {
      m.set(it.id, {
        name: it.name,
        code: it.code,
        categoryId: it.categoryId,
        subCategoryId: it.subCategoryId,
        category: (it.categoryId && catName.get(it.categoryId)) || "Uncategorised",
        subCategory: (it.subCategoryId && subName.get(it.subCategoryId)) || "",
        unit: (it.unitId && unitCode.get(it.unitId)) || "",
      });
    }
    return m;
  }, [items.data, master.data]);

  const itemOptions = useMemo(
    () => (items.data || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [items.data],
  );

  const lines = analytics.data?.lines || [];
  const invoices = analytics.data?.invoices || [];
  const invoiceById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);

  const agg = useMemo(() => {
    const totals = { gross: 0, net: 0, vat: 0, count: invoices.length };
    const supSet = new Set();
    const byMonth = new Map();
    const bySupplier = new Map();
    for (const inv of invoices) {
      totals.gross += inv.gross; totals.net += inv.net; totals.vat += inv.vat;
      if (inv.supplierId) supSet.add(inv.supplierId);
      const ym = (inv.issueDate || "").slice(0, 7);
      if (ym) byMonth.set(ym, (byMonth.get(ym) || 0) + inv.gross);
      bySupplier.set(inv.supplierName, (bySupplier.get(inv.supplierName) || 0) + inv.gross);
    }

    const byItem = new Map();
    let unmappedGross = 0, lineGross = 0;
    for (const l of lines) {
      lineGross += l.gross;
      if (!l.itemId) { unmappedGross += l.gross; continue; }
      const nm = itemMap.get(l.itemId)?.name || "(item)";
      byItem.set(nm, (byItem.get(nm) || 0) + l.gross);
    }

    const monthly = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, gross]) => ({ ym, label: monthLabel(ym), gross: Math.round(gross) }));
    const topSuppliers = [...bySupplier.entries()].map(([name, gross]) => ({ name, gross: Math.round(gross) }))
      .sort((a, b) => b.gross - a.gross).slice(0, 8);
    const topItems = [...byItem.entries()].map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value).slice(0, 10);

    return {
      totals,
      suppliersUsed: supSet.size,
      avg: totals.count ? totals.gross / totals.count : 0,
      monthly, topSuppliers, topItems,
      unmappedShare: lineGross ? unmappedGross / lineGross : 0,
    };
  }, [invoices, lines, itemMap]);

  const activeItems = (items.data || []).filter((i) => i.isActive).length;
  const activeSuppliers = (suppliers.data || []).filter((s) => s.isActive).length;
  const lowStock = (stock.data || []).filter((s) => s.status === "low" || s.status === "critical").length;
  const outStock = (stock.data || []).filter((s) => s.status === "out").length;

  const loading = analytics.isLoading;
  const error = analytics.error;

  return (
    <div>
      <PageHeader title="Dashboard" />

      {preset === "custom" && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">From</span>
            <input
              type="date"
              value={customFrom || ""}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">To</span>
            <input
              type="date"
              value={customTo || ""}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </label>
          <span className="pb-2 text-xs text-slate-400">applies to every tab</span>
        </div>
      )}

      {/* Tabs and date presets share a row that wraps; each group scrolls
          sideways on its own rather than pushing the page wider. Six presets
          with word labels no longer fit beside the title. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${
                tab === t.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 pb-1">
          {/* Month navigator — replaces the This month / Last month buttons,
              so any month is two clicks away instead of only the last two. */}
          <div
            className={`flex items-center overflow-hidden rounded-md border ${
              preset === "month" ? "border-teal-600" : "border-slate-300"
            }`}
          >
            <button
              onClick={() => stepMonth(-1)}
              aria-label="Previous month"
              className={`px-2 py-1.5 text-sm ${
                preset === "month" ? "bg-teal-600 text-white hover:bg-teal-700" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              ‹
            </button>
            <button
              onClick={() => setPreset("month")}
              title="Show this month"
              className={`min-w-[86px] whitespace-nowrap px-2 py-1.5 text-xs font-semibold ${
                preset === "month" ? "bg-teal-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {monthName(anchor)}
            </button>
            <button
              onClick={() => stepMonth(1)}
              disabled={atCurrentMonth}
              aria-label="Next month"
              className={`px-2 py-1.5 text-sm disabled:opacity-40 ${
                preset === "month" ? "bg-teal-600 text-white hover:bg-teal-700" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              ›
            </button>
          </div>

          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
                preset === p.key
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorBox error={error} />
      ) : loading ? (
        <Loading label="Crunching the numbers…" />
      ) : agg.totals.count === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          No invoices in this period. Try a wider range, or fetch invoices from{" "}
          <Link to="/download-ksef" className="text-teal-600 underline">Download KSeF</Link>.
        </Card>
      ) : tab === "categories" ? (
        <CategoriesTab lines={lines} invoiceById={invoiceById} itemMap={itemMap} />
      ) : tab === "items" ? (
        <ItemAnalysisTab lines={lines} invoiceById={invoiceById} itemMap={itemMap} itemOptions={itemOptions} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Total spend" value={money0(agg.totals.gross)} sub="gross" tone="teal" />
            <Kpi label="Net" value={money0(agg.totals.net)} sub={`VAT ${money0(agg.totals.vat)}`} />
            <Kpi label="Invoices" value={agg.totals.count} sub={`avg ${money0(agg.avg)}`} to="/invoices" />
            <Kpi label="Suppliers" value={agg.suppliersUsed} sub={`${activeSuppliers} active`} to="/masterdata" />
            <Kpi label="Active items" value={activeItems} to="/masterdata" />
            <Kpi
              label="Unmapped spend"
              value={`${Math.round(agg.unmappedShare * 100)}%`}
              sub="of line value"
              to="/invoice-details"
              tone={agg.unmappedShare > 0.15 ? "amber" : "slate"}
            />
          </div>

          <ChartCard title="Spend over time (gross)">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={agg.monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0d9488" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={40} />
                <Tooltip formatter={(v) => money2(v)} />
                <Area type="monotone" dataKey="gross" stroke="#0d9488" strokeWidth={2} fill="url(#spend)" name="Spend" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Top suppliers (gross)">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={agg.topSuppliers} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#eef2f7" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => money2(v)} />
                  <Bar dataKey="gross" radius={[0, 4, 4, 0]}>
                    {agg.topSuppliers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Top items by spend"
              right={<button onClick={() => setTab("items")} className="text-xs font-semibold text-teal-600 hover:underline">Analyse an item →</button>}
            >
              <div className="max-h-72 overflow-y-auto">
                <BarList rows={agg.topItems} emptyLabel="No mapped item lines yet — map lines in Invoice details." />
              </div>
            </ChartCard>
          </div>

          <ChartCard title="Stock health">
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <Kpi label="Low / critical" value={lowStock} to="/stock" tone={lowStock ? "amber" : "slate"} />
              <Kpi label="Out of stock" value={outStock} to="/stock" tone={outStock ? "red" : "slate"} />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Stock levels update from receiving/counts. Set reorder points on items to surface low stock.
            </p>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
