// src/components/SortTh.jsx — clickable sortable table header (▲ ▼ ↕).
// `align="right"` for numeric columns — a left-aligned header over right-aligned
// figures reads as a mismatch, and the alignment can't be overridden through
// className because Tailwind's output order, not class order, decides.
export function SortTh({ label, field, sort, align = "left", className = "" }) {
  const active = sort.key === field;
  return (
    <th
      onClick={() => sort.toggle(field)}
      title="Click to sort"
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 font-semibold ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {label}
      <span className={`ml-1 text-[0.8em] ${active ? "opacity-100" : "opacity-30"}`}>
        {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}
