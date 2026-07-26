// src/components/ui/ItemPicker.jsx
// Searchable replacement for a long <select> of catalogue items.
//
// A native <select> with hundreds of options is unusable on a phone (no typing,
// tiny scroll wheel) and awkward on desktop. This renders a trigger button that
// opens a sheet/dialog with a sticky search box and a filtered list — the same
// interaction on both, so nothing gets clipped by the table's overflow.
import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal.jsx";

const MAX_RENDERED = 200;

const norm = (s) => String(s || "").toLowerCase().trim();

export default function ItemPicker({
  value,
  onChange,
  options,
  placeholder = "— unmapped —",
  title = "Choose item",
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef(null);

  const selected = useMemo(
    () => (value ? options.find((o) => o.id === value) || null : null),
    [value, options],
  );

  useEffect(() => {
    if (!open) return;
    setQ("");
    // Desktop gets an autofocused search box; on touch we skip it so the
    // keyboard doesn't cover the list before you've seen it.
    const isTouch = window.matchMedia?.("(hover: none)").matches;
    if (!isTouch) setTimeout(() => searchRef.current?.focus(), 30);
  }, [open]);

  // Match every whitespace-separated term, in any order, against name + code.
  const filtered = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return options;
    return options.filter((o) => {
      const hay = `${norm(o.name)} ${norm(o.code)}`;
      return terms.every((t) => hay.includes(t));
    });
  }, [q, options]);

  const pick = (id) => {
    setOpen(false);
    onChange(id);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-50 ${
          selected ? "border-slate-300 bg-white" : "border-amber-300 bg-amber-50"
        } ${className}`}
      >
        <span className={`min-w-0 truncate ${selected ? "text-slate-800" : "text-amber-700"}`}>
          {selected ? selected.name : placeholder}
        </span>
        <span aria-hidden className="shrink-0 text-xs text-slate-400">▾</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 border-b border-slate-100 bg-white px-4 pb-3 pt-4 sm:-mx-5 sm:px-5">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search items…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-400 sm:text-sm"
          />
        </div>

        <div className="-mx-1 mt-2">
          <button
            type="button"
            onClick={() => pick(null)}
            className={`w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
              value ? "text-slate-500" : "font-semibold text-teal-700"
            }`}
          >
            {placeholder}
          </button>

          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">No items match “{q}”.</p>
          ) : (
            filtered.slice(0, MAX_RENDERED).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                  o.id === value ? "bg-teal-50 font-semibold text-teal-800" : "text-slate-700"
                }`}
              >
                <span className="min-w-0 break-words">{o.name}</span>
                {o.code ? <span className="shrink-0 text-xs text-slate-400">{o.code}</span> : null}
              </button>
            ))
          )}

          {filtered.length > MAX_RENDERED && (
            <p className="px-3 py-3 text-center text-xs text-slate-400">
              Showing {MAX_RENDERED} of {filtered.length} — keep typing to narrow it down.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
