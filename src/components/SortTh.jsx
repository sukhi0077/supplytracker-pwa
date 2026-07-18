// src/components/SortTh.jsx — clickable sortable table header (▲ ▼ ↕).
export function SortTh({ label, field, sort, className = "" }) {
  const active = sort.key === field;
  return (
    <th
      onClick={() => sort.toggle(field)}
      title="Click to sort"
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left font-semibold ${className}`}
    >
      {label}
      <span className={`ml-1 text-[0.8em] ${active ? "opacity-100" : "opacity-30"}`}>
        {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}
