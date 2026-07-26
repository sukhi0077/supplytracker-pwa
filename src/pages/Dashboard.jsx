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

const iso = (d) => d.toISOString().slice(0, 10);

function rangeFor(preset) {
  const now = new Date();
  const to = iso(now);
  if (preset === "all") return { from: undefined, to: undefined };
  if (preset === "ytd") return { from: `${now.getFullYear()}-01-01`, to };
  const n = { "3m": 3, "6m": 6, "12m": 12 }[preset] ?? 12;
  const d = new Date(now.getFullYear(), now.getMonth() - n, now.getDate());
  return { from: iso(d), to };
}

const PRESETS = [
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "12m", label: "12M" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "categories", label: "Categories" },
  { key: "items", label: "Item analysis" },
];

export default function Dashboard() {
  const [preset, setPreset] = useState("12m");
  const [tab, setTab] = useState("overview");
  const { from, to } = useMemo(() => rangeFor(preset), [preset]);

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
      <PageHeader
        title="Dashboard"
        subtitle="Purchasing analytics from your KSeF invoices."
        right={
          <div className="flex gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                  preset === p.key ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Tabs — scrollable rather than wrapping on a narrow phone. */}
      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
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
