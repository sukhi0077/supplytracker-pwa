// src/components/UnmappedGroups.jsx
// Unmapped invoice lines collapsed to one row per distinct KSeF text.
//
// The same supplier bills the same wording every time, so a flat list repeats
// "Masło extra 82% 200g" once per invoice and asks you to decide each one.
// Grouping turns N lines into one decision: map the group and every line in it
// is written at once.
//
// Grouped by normalised text AND supplier, because mappings can be
// supplier-scoped — two suppliers using the same wording stay separate rows so
// each can point at its own item and pack size.
import { useMemo, useState } from "react";
import { normalizeKsefName } from "../utils/ksefMatch.js";
import ItemPicker from "./ui/ItemPicker.jsx";
import CopyButton from "./ui/CopyButton.jsx";
import { Empty } from "./ui/parts.jsx";

const money = (v) => (v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const num = (v) => (v == null ? "—" : Number(v).toLocaleString());

const viaTone = {
  mapping: "bg-emerald-100 text-emerald-700 border-emerald-200",
  keyword: "bg-teal-100 text-teal-700 border-teal-200",
  name: "bg-sky-100 text-sky-700 border-sky-200",
  catalogue: "bg-slate-100 text-slate-600 border-slate-200",
  supplier: "bg-violet-100 text-violet-700 border-violet-200",
};
const pct = (s) => `${Math.round(s * 100)}%`;

export function groupUnmapped(lines) {
  const groups = new Map();
  for (const l of lines || []) {
    const key = `${l.supplierId || "?"}::${normalizeKsefName(l.ksefItemName || "") || l.ksefItemName || "(blank)"}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        ksefItemName: l.ksefItemName || "",
        supplierId: l.supplierId,
        supplierName: l.supplierName,
        supplierKsefName: l.supplierKsefName,
        ids: [],
        variants: new Set(),
        net: 0,
        qty: 0,
        unit: l.unit || "",
        firstDate: l.issueDate || "",
        lastDate: l.issueDate || "",
      });
    }
    const g = groups.get(key);
    g.ids.push(l.id);
    if (l.ksefItemName) g.variants.add(l.ksefItemName);
    g.net += l.netTotal || 0;
    g.qty += l.quantity || 0;
    if (l.issueDate) {
      if (!g.firstDate || l.issueDate < g.firstDate) g.firstDate = l.issueDate;
      if (!g.lastDate || l.issueDate > g.lastDate) g.lastDate = l.issueDate;
    }
  }
  // Most lines first: clearing the top of this list removes the most work.
  return [...groups.values()].sort((a, b) => b.ids.length - a.ids.length || b.net - a.net);
}

export default function UnmappedGroups({ lines, itemOptions, suggest, onPick, isAdmin }) {
  const [q, setQ] = useState("");

  const groups = useMemo(() => groupUnmapped(lines), [lines]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return groups;
    return groups.filter(
      (g) => g.ksefItemName.toLowerCase().includes(n) || (g.supplierName || "").toLowerCase().includes(n),
    );
  }, [groups, q]);

  const totalLines = groups.reduce((s, g) => s + g.ids.length, 0);

  if (!groups.length) {
    return <div className="p-2"><Empty>No unmapped lines — everything is mapped.</Empty></div>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter texts or suppliers…"
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
        <span className="text-xs text-slate-500">
          <strong className="text-slate-700">{filtered.length}</strong> distinct text
          {filtered.length === 1 ? "" : "s"} covering {totalLines} line{totalLines === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2">
        {filtered.map((g) => {
          const sugg = suggest
            ? suggest(g.ksefItemName, {
                supplierId: g.supplierId,
                supplierName: g.supplierName,
                supplierKsefName: g.supplierKsefName,
              })
            : [];
          return (
            <div key={g.key} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 break-words text-sm font-medium text-slate-800">
                      {g.ksefItemName || "(blank)"}
                    </span>
                    {/* Copy the supplier's wording — it's the starting point for
                        a new catalogue item, or for searching the picker. */}
                    <CopyButton text={g.ksefItemName} />
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {g.supplierName || "—"} · {g.firstDate}
                    {g.lastDate !== g.firstDate ? ` → ${g.lastDate}` : ""}
                    {g.variants.size > 1 ? ` · ${g.variants.size} wordings` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="rounded-full bg-amber-200/70 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                    {g.ids.length} line{g.ids.length === 1 ? "" : "s"}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {num(g.qty)} {g.unit} · {money(g.net)} net
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-2 space-y-1.5">
                  {sugg.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sugg.map((s) => (
                        <button
                          key={s.itemId}
                          onClick={() => onPick(g, s.itemId)}
                          title={`${s.via} match — applies to all ${g.ids.length} lines`}
                          className={`rounded-full border px-2 py-1 text-xs hover:brightness-95 ${viaTone[s.via] || viaTone.catalogue}`}
                        >
                          {s.itemName} <span className="font-semibold">{pct(s.score)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <ItemPicker
                    value={null}
                    onChange={(itemId) => itemId && onPick(g, itemId)}
                    options={itemOptions}
                    placeholder={`— map all ${g.ids.length} lines to… —`}
                    title="Choose catalogue item"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
