// src/components/ui/form.jsx
// Compact form primitives shared by the editor modals.

export function Field({ label, children, hint, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

const base =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50";

export function Text({ value, onChange, className = "", ...rest }) {
  return (
    <input
      className={`${base} ${className}`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function Num({ value, onChange, ...rest }) {
  return (
    <input
      type="number"
      className={base}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      {...rest}
    />
  );
}

// Parse a decimal typed with either separator. Returns null if it isn't a
// usable number, so callers can show an error instead of silently defaulting.
export const parseDecimal = (v) => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s || !/^\d*\.?\d*$/.test(s) || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// Decimal input as TEXT, not type="number".
//
// A Polish keyboard's decimal key is a comma, and <input type="number"> throws
// away the ENTIRE value when it sees one — so typing "0,2" yields "" and the
// field looks like it refuses decimals. This keeps the raw string, accepts both
// separators, and normalises to a dot.
export function Decimal({ value, onChange, className = "", ...rest }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={`${base} ${className}`}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".");
        // Allow intermediate states like "" and "0." while typing.
        if (raw === "" || /^\d*\.?\d*$/.test(raw)) onChange(raw);
      }}
      {...rest}
    />
  );
}

export function Area({ value, onChange, rows = 3, ...rest }) {
  return (
    <textarea
      className={base}
      rows={rows}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function Select({ value, onChange, options, placeholder = "—", ...rest }) {
  return (
    <select
      className={base}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      {...rest}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Btn({ children, variant = "ghost", ...rest }) {
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    ghost: "border border-slate-200 text-slate-700 hover:bg-slate-100",
    danger: "border border-red-200 text-red-600 hover:bg-red-50",
  }[variant];
  return (
    <button
      className={`rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-50 ${styles}`}
      {...rest}
    >
      {children}
    </button>
  );
}
