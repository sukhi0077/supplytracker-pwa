// src/components/ui/DateRangeBar.jsx
// Shared date-range control: month stepper + presets in one toolbar, with the
// state and the range maths alongside it so every page filters identically.
//
// Dates are formatted from LOCAL calendar parts, never toISOString().slice() —
// that converts to UTC first, and in Poland (UTC+1/+2) it turns the 1st of the
// month at 00:00 into the last day of the previous one.
import { useMemo, useState } from "react";

export const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const PRESETS = [
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "custom", label: "Custom" },
];

export const monthName = (a) =>
  new Date(a.y, a.m, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

// `anchor` is { y, m } — the month the navigator points at.
export function rangeFor(preset, anchor) {
  const now = new Date();
  const to = iso(now);
  const y = now.getFullYear();
  const m = now.getMonth();

  if (preset === "month") {
    const a = anchor || { y, m };
    const isCurrent = a.y === y && a.m === m;
    // Day 0 of the next month is the last day of this one. The current month
    // stops at today rather than running into the future.
    return { from: iso(new Date(a.y, a.m, 1)), to: isCurrent ? to : iso(new Date(a.y, a.m + 1, 0)) };
  }
  if (preset === "ytd") return { from: `${y}-01-01`, to };
  const n = { "3m": 3, "6m": 6 }[preset] ?? 3;
  return { from: iso(new Date(y, m - n, now.getDate())), to };
}

export function useDateRange(initialPreset = "month") {
  const [preset, setPreset] = useState(initialPreset);
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [customFrom, setCustomFrom] = useState(() => rangeFor("3m").from);
  const [customTo, setCustomTo] = useState(() => iso(new Date()));

  const now = new Date();
  const atCurrentMonth = anchor.y === now.getFullYear() && anchor.m === now.getMonth();

  // Can't step past the current month — there's nothing there.
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
  }, [preset, anchor, customFrom, customTo]);

  return {
    from, to, preset, setPreset, anchor, stepMonth, atCurrentMonth,
    customFrom, setCustomFrom, customTo, setCustomTo,
  };
}

// Arrows are their own outlined buttons with a gap either side of the month —
// they're a different kind of action (step) from the label (select), and butted
// together they read as one wide button.
const ARROW =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-base leading-none text-slate-500 " +
  "hover:bg-slate-50 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-white";

function MonthStepper({ range }) {
  const { preset, setPreset, anchor, stepMonth, atCurrentMonth } = range;
  return (
    <>
      <button onClick={() => stepMonth(-1)} aria-label="Previous month" className={ARROW}>
        ‹
      </button>
      <button
        onClick={() => setPreset("month")}
        title="Show this month"
        className={`min-w-[86px] whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ${
          preset === "month" ? "bg-teal-600 text-white" : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        {monthName(anchor)}
      </button>
      <button onClick={() => stepMonth(1)} disabled={atCurrentMonth} aria-label="Next month" className={ARROW}>
        ›
      </button>
    </>
  );
}

// With presets: one bordered toolbar. Without them (`presets={false}`), just the
// stepper — no outer box for three controls to sit in.
export function DateRangeBar({ range, presets = true, className = "" }) {
  const { preset, setPreset } = range;

  if (!presets) {
    return <div className={`flex items-center gap-1.5 ${className}`}><MonthStepper range={range} /></div>;
  }

  return (
    <div
      className={`flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-1.5 py-1 ${className}`}
    >
      <MonthStepper range={range} />

      <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />

      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => setPreset(p.key)}
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
            preset === p.key ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// The from/to inputs, shown only when Custom is selected.
export function CustomRangeFields({ range }) {
  const { preset, customFrom, setCustomFrom, customTo, setCustomTo } = range;
  if (preset !== "custom") return null;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
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
    </div>
  );
}
