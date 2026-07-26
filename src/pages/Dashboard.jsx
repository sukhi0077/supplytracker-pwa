// src/pages/Dashboard.jsx
// Purchasing analytics: KPIs + charts (spend over time, by category, by supplier,
// top items) from the KSeF-fetched invoices, plus catalogue/stock health.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area, PieChart, Pie, Legend,
} from "recharts";
import {
  useItems,
  useSuppliers,
  useStockLevels,
  usePurchaseAnalytics,
} from "../hooks/useCatalogue.js";
import { PageHeader, Card, Loading, ErrorBox } from "../components/ui/parts.jsx";

const COLORS = ["#0d9488", "#7c3aed", "#0891b2", "#059669", "#d97706", "#db2777", "#65a30d", "#2563eb", "#ca8a04", "#dc2626"];

const money0 = (n) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(n || 0);
const money2 = (n) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
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

function Kpi({ label, value, sub, to, tone = "slate" }) {
  const toneCls = { slate: "text-slate-900", teal: "text-teal-700", amber: "text-amber-600", red: "text-red-600", violet: "text-violet-700" }[tone];
  const body = (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </Card>
  );
  return to ? <Link to={to} className="block transition hover:opacity-80">{body}</Link> : body;
}

function ChartCard({ title, right, children, className = "" }) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {right}
      </div>
      {children}
    </Card>
  );
}

const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

export default function Dashboard() {
  const [preset, setPreset] = useState("12m");
  const { from, to } = useMemo(() => rangeFor(preset), [preset]);

  const analytics = usePurchaseAnalytics(from, to);
  const items = useItems();
  const suppliers = useSuppliers();
  const stock = useStockLevels();

  const itemMap = useMemo(() => {
    const m = new Map();
    for (const it of items.data || []) m.set(it.id, { name: it.name, category: it.category || "Uncategorised" });
    return m;
  }, [items.data]);

  const agg = useMemo(() => {
    const invoices = analytics.data?.invoices || [];
    const lines = analytics.data?.lines || [];

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

    const byCategory = new Map();
    const byItem = new Map();
    let unmappedGross = 0, lineGross = 0;
    for (const l of lines) {
      lineGross += l.gross;
      const info = l.itemId ? itemMap.get(l.itemId) : null;
      const cat = l.itemId ? info?.category || "Uncategorised" : "Unmapped";
      byCategory.set(cat, (byCategory.get(cat) || 0) + l.gross);
      if (!l.itemId) unmappedGross += l.gross;
      else {
        const nm = info?.name || "(item)";
        byItem.set(nm, (byItem.get(nm) || 0) + l.gross);
      }
    }

    const monthly = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, gross]) => ({ ym, label: monthLabel(ym), gross: Math.round(gross) }));

    const catArr = [...byCategory.entries()].map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
    const topCats = catArr.slice(0, 8);
    const otherCat = catArr.slice(8).reduce((s, c) => s + c.value, 0);
    if (otherCat > 0) topCats.push({ name: "Other", value: Math.round(otherCat) });

    const topSuppliers = [...bySupplier.entries()].map(([name, gross]) => ({ name, gross: Math.round(gross) }))
      .sort((a, b) => b.gross - a.gross).slice(0, 8);
    const topItems = [...byItem.entries()].map(([name, gross]) => ({ name, gross: Math.round(gross) }))
      .sort((a, b) => b.gross - a.gross).slice(0, 10);

    return {
      totals,
      suppliersUsed: supSet.size,
      avg: totals.count ? totals.gross / totals.count : 0,
      monthly, topCats, topSuppliers, topItems,
      unmappedShare: lineGross ? unmappedGross / lineGross : 0,
    };
  }, [analytics.data, itemMap]);

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

      {error ? (
        <ErrorBox error={error} />
      ) : loading ? (
        <Loading label="Crunching the numbers…" />
      ) : (
        <div className="space-y-4">
          {/* KPI row */}
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

          {agg.totals.count === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              No invoices in this period. Try a wider range, or fetch invoices from{" "}
              <Link to="/download-ksef" className="text-teal-600 underline">Download KSeF</Link>.
            </Card>
          ) : (
            <>
              {/* Spend over time */}
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
                {/* Spend by category */}
                <ChartCard title="Spend by category">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={agg.topCats} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
                        {agg.topCats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => money2(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Top suppliers */}
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
              </div>

              {/* Top items + stock health */}
              <div className="grid gap-4 lg:grid-cols-3">
                <ChartCard title="Top items by spend" className="lg:col-span-2">
                  <div className="max-h-80 overflow-y-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                        <tr><th className="py-1">Item</th><th className="py-1 text-right">Gross</th><th className="py-1 pl-4 w-1/2">Share</th></tr>
                      </thead>
                      <tbody>
                        {agg.topItems.map((it, i) => {
                          const max = agg.topItems[0]?.gross || 1;
                          return (
                            <tr key={it.name} className="border-t border-slate-100">
                              <td className="py-1.5 pr-2 font-medium text-slate-800">{it.name}</td>
                              <td className="py-1.5 text-right text-slate-600">{money0(it.gross)}</td>
                              <td className="py-1.5 pl-4">
                                <div className="h-2 rounded-full bg-slate-100">
                                  <div className="h-2 rounded-full" style={{ width: `${(it.gross / max) * 100}%`, background: COLORS[i % COLORS.length] }} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {agg.topItems.length === 0 && <tr><td className="py-3 text-slate-400" colSpan={3}>No mapped item lines yet — map lines in Invoice details.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>

                <ChartCard title="Stock health">
                  <div className="grid grid-cols-2 gap-3">
                    <Kpi label="Low / critical" value={lowStock} to="/stock" tone={lowStock ? "amber" : "slate"} />
                    <Kpi label="Out of stock" value={outStock} to="/stock" tone={outStock ? "red" : "slate"} />
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    Stock levels update from receiving/counts. Set reorder points on items to surface low stock.
                  </p>
                </ChartCard>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
