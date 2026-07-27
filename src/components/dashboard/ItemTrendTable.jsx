// src/components/dashboard/ItemTrendTable.jsx
// One row per item, each with a single chart carrying three lines:
// quantity ordered, gross paid, and price per base unit.
//
// The three series differ by orders of magnitude (200 kg vs 880 zł vs 4.40 zł),
// so plotting them on a shared axis would flatten the price line onto the
// floor. Each series is instead normalised to its own min/max within the row —
// the SHAPE of each line is faithful, the vertical position is not comparable
// between series. Actual values live in the columns and the hover tooltip.
import { useMemo, useState } from "react";
import { money0, money4, qty as fmtQty } from "./common.jsx";

const W = 320; // viewBox width; the svg itself stretches to the column
const H = 40;
const PAD = 4;

const SERIES = [
  { key: "qty", label: "Quantity", color: "#2a78d6" },
  { key: "gross", label: "Gross paid", color: "#eb6834" },
  { key: "price", label: "Price / unit", color: "#1baf7a" },
];

// Normalise one series into the row box. A flat series sits on the centre line
// rather than collapsing to the top or bottom edge.
function path(values, w = W, h = H) {
  const real = values.filter((v) => v != null);
  if (real.length < 1) return "";
  const min = Math.min(...real);
  const max = Math.max(...real);
  const span = max - min;
  const n = values.length;
  const x = (i) => (n === 1 ? w / 2 : (i / (n - 1)) * (w - 2) + 1);
  const y = (v) => (span === 0 ? h / 2 : h - PAD - ((v - min) / span) * (h - 2 * PAD));

  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });
  return d.trim();
}

function lastPoint(values, w = W, h = H) {
  const idx = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
  if (idx == null || idx < 0) return null;
  const real = values.filter((v) => v != null);
  const min = Math.min(...real), max = Math.max(...real), span = max - min;
  const n = values.length;
  return {
    x: n === 1 ? w / 2 : (idx / (n - 1)) * (w - 2) + 1,
    y: span === 0 ? h / 2 : h - PAD - ((values[idx] - min) / span) * (h - 2 * PAD),
  };
}

const monthShort = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

function Delta({ value, lowerIsBetter }) {
  if (value == null) return <span className="text-slate-300">—</span>;
  const flat = Math.abs(value) < 0.01;
  const good = lowerIsBetter ? value < 0 : value > 0;
  const cls = flat ? "bg-slate-100 text-slate-500" : good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}>
      {value > 0 ? "+" : ""}{(value * 100).toFixed(1)}%
    </span>
  );
}

export default function ItemTrendTable({ lines, invoiceById, itemMap, onPickItem }) {
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  const { rows, months } = useMemo(() => {
    // Bucket every mapped line by item and month.
    const monthSet = new Set();
    const byItem = new Map();
    for (const l of lines) {
      if (!l.itemId) continue;
      const date = invoiceById.get(l.invoiceId)?.issueDate || "";
      const ym = date.slice(0, 7);
      if (!ym) continue;
      monthSet.add(ym);
      if (!byItem.has(l.itemId)) byItem.set(l.itemId, { itemId: l.itemId, buckets: new Map(), orders: new Set(), net: 0, gross: 0, base: 0 });
      const it = byItem.get(l.itemId);
      it.orders.add(l.invoiceId);
      it.net += l.net;
      it.gross += l.gross;
      it.base += l.baseQuantity || 0;
      if (!it.buckets.has(ym)) it.buckets.set(ym, { qty: 0, gross: 0, net: 0, base: 0 });
      const b = it.buckets.get(ym);
      b.qty += l.baseQuantity || 0;
      b.gross += l.gross;
      b.net += l.net;
      b.base += l.baseQuantity || 0;
    }

    const months = [...monthSet].sort();
    const rows = [...byItem.values()].map((it) => {
      const info = itemMap.get(it.itemId);
      // A month with no purchase is a gap, not a zero — zero would draw a
      // spike down to the floor and misrepresent the trend.
      const series = months.map((ym) => it.buckets.get(ym) || null);
      const qtyS = series.map((b) => (b ? b.qty : null));
      const grossS = series.map((b) => (b ? b.gross : null));
      const priceS = series.map((b) => (b && b.base ? b.net / b.base : null));
      const firstPrice = priceS.find((v) => v != null) ?? null;
      const lastPrice = [...priceS].reverse().find((v) => v != null) ?? null;
      return {
        ...it,
        name: info?.name || "(item)",
        unit: info?.unit || "",
        category: info?.category || "",
        qtyS, grossS, priceS,
        lastPrice,
        avgPrice: it.base ? it.net / it.base : null,
        change: firstPrice && lastPrice ? (lastPrice - firstPrice) / firstPrice : null,
        orders: it.orders.size,
      };
    }).sort((a, b) => b.gross - a.gross);

    return { rows, months };
  }, [lines, invoiceById, itemMap]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(n) || (r.category || "").toLowerCase().includes(n));
  }, [rows, q]);

  const shown = showAll || q.trim() ? filtered : filtered.slice(0, 20);

  if (!rows.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        No mapped item lines in this period.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter items…"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          <span className="text-slate-400">
            {months.length ? `${monthShort(months[0])} – ${monthShort(months[months.length - 1])}` : ""}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-52 py-2 pr-3 font-semibold">Item</th>
              <th className="py-2 pr-3 font-semibold">Quantity · gross · unit price</th>
              <th className="w-24 py-2 pr-3 text-right font-semibold">Qty</th>
              <th className="w-24 py-2 pr-3 text-right font-semibold">Gross</th>
              <th className="w-32 py-2 text-right font-semibold">Price / unit</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.itemId}
                className={`border-t border-slate-100 ${onPickItem ? "cursor-pointer hover:bg-slate-50" : ""}`}
                onClick={onPickItem ? () => onPickItem(r.itemId) : undefined}
              >
                <td className="py-2 pr-3 align-middle">
                  <div className="truncate font-medium text-slate-800" title={r.name}>{r.name}</div>
                  <div className="truncate text-[11px] text-slate-400">
                    {r.orders} order{r.orders === 1 ? "" : "s"}{r.category ? ` · ${r.category}` : ""}
                  </div>
                </td>
                <td className="py-2 pr-3 align-middle">
                  <svg
                    viewBox={`0 0 ${W} ${H}`}
                    width="100%"
                    height={H}
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`${r.name}: quantity, gross and unit price trend`}
                  >
                    <title>
                      {`${r.name} — latest: ${fmtQty(r.qtyS.filter(Boolean).pop())} ${r.unit}, ${money0(r.grossS.filter(Boolean).pop() || 0)}, ${money4(r.lastPrice)}/${r.unit || "unit"}`}
                    </title>
                    {SERIES.map((s) => {
                      const values = s.key === "qty" ? r.qtyS : s.key === "gross" ? r.grossS : r.priceS;
                      const d = path(values);
                      const lp = lastPoint(values);
                      return (
                        <g key={s.key}>
                          <path
                            d={d}
                            fill="none"
                            stroke={s.color}
                            strokeWidth={s.key === "price" ? 2 : 1.4}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                            opacity={s.key === "price" ? 1 : 0.75}
                          />
                          {lp && <circle cx={lp.x} cy={lp.y} r="2.4" fill={s.color} vectorEffect="non-scaling-stroke" />}
                        </g>
                      );
                    })}
                  </svg>
                </td>
                <td className="py-2 pr-3 text-right align-middle tabular-nums text-slate-600">
                  {fmtQty(r.base)}<span className="ml-1 text-[11px] text-slate-400">{r.unit}</span>
                </td>
                <td className="py-2 pr-3 text-right align-middle tabular-nums text-slate-700">{money0(r.gross)}</td>
                <td className="py-2 text-right align-middle">
                  <div className="tabular-nums font-medium text-slate-800">{money4(r.lastPrice)}</div>
                  <div className="mt-0.5"><Delta value={r.change} lowerIsBetter /></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>
          {shown.length} of {rows.length} items
          {months.length < 2 && " · only one month in range — lines need at least two points"}
        </span>
        {!q.trim() && rows.length > 20 && (
          <button onClick={() => setShowAll((v) => !v)} className="font-semibold text-teal-600 hover:underline">
            {showAll ? "Show top 20" : `Show all ${rows.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
