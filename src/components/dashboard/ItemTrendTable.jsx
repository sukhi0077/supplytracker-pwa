// src/components/dashboard/ItemTrendTable.jsx
// One row per item, each with a single chart carrying three lines:
// quantity ordered, gross paid, and price per base unit.
//
// The three series differ by orders of magnitude (200 kg vs 880 zł vs 4.40 zł),
// so plotting them on a shared axis would flatten the price line onto the
// floor. Each series is instead normalised to its own min/max within the row —
// the SHAPE of each line is faithful, the vertical position is not comparable
// between series. Actual values live in the columns and the hover tooltip.
//
// Points are ONE PER PURCHASE DATE, placed at their real position along the
// period's timeline — not bucketed by month. Monthly buckets meant four orders
// inside one month collapsed to a single point, and a one-point line draws
// nothing at all. The x scale is shared by every row, so two rows remain
// comparable in time even though they were bought on different days.
import { useMemo, useState } from "react";
import { money0, moneyUnit, qty as fmtQty } from "./common.jsx";

const W = 320; // viewBox width; the svg itself stretches to the column
const H = 40;
const PAD = 4;
const DAY = 86400000;

const SERIES = [
  { key: "qty", label: "Quantity", color: "#2a78d6" },
  { key: "gross", label: "Gross paid", color: "#eb6834" },
  { key: "price", label: "Price / unit", color: "#1baf7a" },
];

// points: [{ fx, v }] with fx already 0..1 along the shared timeline.
// A flat series sits on the centre line rather than collapsing to an edge.
function scale(points, w = W, h = H) {
  const real = points.filter((p) => p.v != null);
  if (!real.length) return [];
  const vals = real.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min;
  return real.map((p) => ({
    x: 1 + p.fx * (w - 2),
    y: span === 0 ? h / 2 : h - PAD - ((p.v - min) / span) * (h - 2 * PAD),
  }));
}

function toPath(pts) {
  if (!pts.length) return "";
  return pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

const dayLabel = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });

// Tolerant match: "Online portal", "online-portal", "ONLINE PORTAL" all count.
const PORTAL = /online[\s_-]*portal/i;
const isPortal = (r) => PORTAL.test(r.subCategory || "");

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
  const [hidePortal, setHidePortal] = useState(false);
  const [sort, setSort] = useState("change");
  // Which series is drawn at full strength; the other two sit behind it faintly
  // for context, since they share the row box but not the scale.
  const [metric, setMetric] = useState("price");

  const { rows, span } = useMemo(() => {
    // One bucket per (item, purchase date) — every order becomes a point.
    const byItem = new Map();
    let minT = Infinity;
    let maxT = -Infinity;

    for (const l of lines) {
      if (!l.itemId) continue;
      const date = invoiceById.get(l.invoiceId)?.issueDate || "";
      if (!date) continue;
      const t = Date.parse(date);
      if (!Number.isFinite(t)) continue;
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;

      if (!byItem.has(l.itemId)) {
        byItem.set(l.itemId, { itemId: l.itemId, days: new Map(), orders: new Set(), net: 0, gross: 0, base: 0 });
      }
      const it = byItem.get(l.itemId);
      it.orders.add(l.invoiceId);
      it.net += l.net;
      it.gross += l.gross;
      it.base += l.baseQuantity || 0;

      if (!it.days.has(date)) it.days.set(date, { date, t, qty: 0, gross: 0, net: 0, base: 0 });
      const b = it.days.get(date);
      b.qty += l.baseQuantity || 0;
      b.gross += l.gross;
      b.net += l.net;
      b.base += l.baseQuantity || 0;
    }

    const range = maxT > minT ? maxT - minT : 0;
    // Everything on one day → a single centred point per series.
    const fx = (t) => (range === 0 ? 0.5 : (t - minT) / range);

    const rows = [...byItem.values()].map((it) => {
      const info = itemMap.get(it.itemId);
      const days = [...it.days.values()].sort((a, b) => a.t - b.t);
      const at = (v) => days.map((d) => ({ fx: fx(d.t), v: v(d) }));

      const priceOf = (d) => (d.base ? d.net / d.base : null);
      const firstPrice = priceOf(days[0]);
      const lastPrice = priceOf(days[days.length - 1]);

      return {
        ...it,
        name: info?.name || "(item)",
        unit: info?.unit || "",
        category: info?.category || "",
        subCategory: info?.subCategory || "",
        days,
        qtyP: at((d) => d.qty),
        grossP: at((d) => d.gross),
        priceP: at(priceOf),
        lastPrice,
        lastDate: days[days.length - 1]?.date || "",
        avgPrice: it.base ? it.net / it.base : null,
        change: firstPrice && lastPrice ? (lastPrice - firstPrice) / firstPrice : null,
        orders: it.orders.size,
        points: days.length,
      };
    });

    return {
      rows,
      span: range === 0 ? null : { from: new Date(minT).toISOString().slice(0, 10), to: new Date(maxT).toISOString().slice(0, 10), days: Math.round(range / DAY) },
    };
  }, [lines, invoiceById, itemMap]);

  // Items in the online-portal sub-category are matched on name rather than id,
  // since the id isn't known here. If this ever stops matching, the count next
  // to the checkbox reads 0 and the mismatch is visible rather than silent.
  const portalCount = useMemo(() => rows.filter(isPortal).length, [rows]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    let out = hidePortal ? rows.filter((r) => !isPortal(r)) : rows;
    if (n) {
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(n) ||
          (r.category || "").toLowerCase().includes(n) ||
          (r.subCategory || "").toLowerCase().includes(n),
      );
    }
    // Biggest price rise first. Items bought only once have no change to
    // measure, so they sort last rather than counting as 0%.
    return [...out].sort((a, b) => {
      if (sort === "spend") return b.gross - a.gross;
      const av = a.change, bv = b.change;
      if (av == null && bv == null) return b.gross - a.gross;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });
  }, [rows, q, hidePortal, sort]);

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
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={hidePortal}
            onChange={(e) => setHidePortal(e.target.checked)}
            className="h-4 w-4"
          />
          Exclude Online portal
          <span className="text-xs text-slate-400">({portalCount})</span>
        </label>

        {/* Metric switcher — doubles as the legend, since the highlighted
            series is the one whose colour is readable. */}
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
          {SERIES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setMetric(s.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition ${
                metric === s.key ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: s.color, opacity: metric === s.key ? 1 : 0.45 }}
              />
              {s.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-400">
          {span ? `${dayLabel(span.from)} – ${dayLabel(span.to)} · one point per order` : "one point per order"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-52 py-2 pr-3 font-semibold">Item</th>
              <th className="py-2 pr-3 font-semibold">Quantity · gross · unit price</th>
              <th className={`w-24 py-2 pr-3 text-right font-semibold ${metric === "qty" ? "text-slate-700" : ""}`}>Qty</th>
              <th className={`w-24 py-2 pr-3 text-right font-semibold ${metric === "gross" ? "text-slate-700" : ""}`}>
                <button
                  type="button"
                  onClick={() => setSort("spend")}
                  className={`uppercase tracking-wide hover:text-slate-600 ${sort === "spend" ? "text-slate-700 underline" : ""}`}
                >
                  Gross
                </button>
              </th>
              <th className={`w-32 py-2 text-right font-semibold ${metric === "price" ? "text-slate-700" : ""}`}>
                <button
                  type="button"
                  onClick={() => setSort("change")}
                  className={`uppercase tracking-wide hover:text-slate-600 ${sort === "change" ? "text-slate-700 underline" : ""}`}
                >
                  Price / unit {sort === "change" ? "↓" : ""}
                </button>
              </th>
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
                    {r.orders} order{r.orders === 1 ? "" : "s"}
                    {r.points !== r.orders ? ` · ${r.points} day${r.points === 1 ? "" : "s"}` : ""}
                    {r.category ? ` · ${r.category}` : ""}
                  </div>
                </td>
                <td className="py-2 pr-3 align-middle">
                  <svg
                    viewBox={`0 0 ${W} ${H}`}
                    width="100%"
                    height={H}
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`${r.name}: ${SERIES.find((s) => s.key === metric)?.label} trend, other metrics faded`}
                  >
                    <title>
                      {`${r.name} — ${r.points} purchase${r.points === 1 ? "" : "s"}, last ${r.lastDate}: ` +
                        `${fmtQty(r.base)} ${r.unit}, ${money0(r.gross)}, ${moneyUnit(r.lastPrice)}/${r.unit || "unit"}`}
                    </title>
                    {/* Ghosts first so the selected series paints on top. */}
                    {[...SERIES]
                      .sort((a, b) => (a.key === metric ? 1 : 0) - (b.key === metric ? 1 : 0))
                      .map((s) => {
                      const pts = scale(
                        s.key === "qty" ? r.qtyP : s.key === "gross" ? r.grossP : r.priceP,
                      );
                      if (!pts.length) return null;
                      const on = s.key === metric;
                      return (
                        <g key={s.key}>
                          <path
                            d={toPath(pts)}
                            fill="none"
                            stroke={s.color}
                            strokeWidth={on ? 2 : 1}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                            opacity={on ? 1 : 0.2}
                          />
                          {/* Only the selected series gets dots — ghost dots
                              read as data points and clutter the row. */}
                          {on &&
                            pts.map((p, i) => (
                              <circle
                                key={i}
                                cx={p.x}
                                cy={p.y}
                                r={i === pts.length - 1 ? 2.6 : 1.7}
                                fill={s.color}
                                vectorEffect="non-scaling-stroke"
                              />
                            ))}
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
                  <div className="tabular-nums font-medium text-slate-800">{moneyUnit(r.lastPrice)}</div>
                  <div className="mt-0.5"><Delta value={r.change} lowerIsBetter /></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>
          {shown.length} of {filtered.length} items
          {hidePortal && portalCount > 0 && ` · ${portalCount} online-portal item${portalCount === 1 ? "" : "s"} hidden`}
          {sort === "change" ? " · sorted by biggest price rise" : " · sorted by spend"}
          {span == null && " · all purchases fall on one day"}
        </span>
        {!q.trim() && filtered.length > 20 && (
          <button onClick={() => setShowAll((v) => !v)} className="font-semibold text-teal-600 hover:underline">
            {showAll ? "Show top 20" : `Show all ${filtered.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
