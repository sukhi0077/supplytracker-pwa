// src/components/dashboard/common.jsx
// Shared formatting + presentational bits for the dashboard tabs.
import { Link } from "react-router-dom";
import { Card } from "../ui/parts.jsx";

export const COLORS = [
  "#0d9488", "#7c3aed", "#0891b2", "#059669", "#d97706",
  "#db2777", "#65a30d", "#2563eb", "#ca8a04", "#dc2626",
];

const pln = (opts) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", ...opts });

// Whole-currency, for headline totals where the grosze are noise.
export const money0 = (n) => pln({ maximumFractionDigits: 0 }).format(n || 0);
// All other money is 2dp — including unit prices, which used to show 4.
export const money2 = (n) => pln({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
export const moneyUnit = (n) => (n == null ? "—" : money2(n));
// Quantities are NOT money — they keep their own precision (0.125 kg is real).
export const qty = (n) =>
  n == null ? "—" : Number(n).toLocaleString("pl-PL", { maximumFractionDigits: 3 });

export const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

export function Kpi({ label, value, sub, to, tone = "slate" }) {
  const toneCls = {
    slate: "text-slate-900",
    teal: "text-teal-700",
    amber: "text-amber-600",
    red: "text-red-600",
    green: "text-emerald-600",
    violet: "text-violet-700",
  }[tone];
  const body = (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </Card>
  );
  return to ? <Link to={to} className="block transition hover:opacity-80">{body}</Link> : body;
}

export function ChartCard({ title, right, children, className = "" }) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {right}
      </div>
      {children}
    </Card>
  );
}

// Horizontal bar list — reads better than a chart on a phone and needs no
// recharts layout maths for long labels.
export function BarList({ rows, format = money0, onPick, emptyLabel = "Nothing here yet." }) {
  // Scale to the largest value, NOT to rows[0]. Most callers pass rows sorted
  // descending so the two coincide, but the supplier list is sorted cheapest
  // first — there rows[0] is the smallest, and dividing by it sent the widest
  // bar to ~1000% and straight out of the card.
  const max = rows.reduce((m, r) => Math.max(m, Number(r.value) || 0), 0) || 1;
  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-400">{emptyLabel}</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium text-slate-800">{r.name}</span>
              <span className="shrink-0 tabular-nums text-slate-600">{format(r.value)}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(2, ((Number(r.value) || 0) / max) * 100))}%`,
                  background: COLORS[i % COLORS.length],
                }}
              />
            </div>
            {r.sub && <div className="mt-0.5 text-[11px] text-slate-400">{r.sub}</div>}
          </>
        );
        return onPick ? (
          <button
            key={r.key ?? r.name}
            type="button"
            onClick={() => onPick(r)}
            className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
          >
            {inner}
          </button>
        ) : (
          <div key={r.key ?? r.name} className="px-2 py-1.5">{inner}</div>
        );
      })}
    </div>
  );
}
