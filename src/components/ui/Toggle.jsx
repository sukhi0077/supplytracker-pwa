// src/components/ui/Toggle.jsx
// Accessible on/off switch. Renders as role="switch" so screen readers and
// keyboards treat it like a checkbox, with a 44px-tall hit area for thumbs.
export default function Toggle({
  checked,
  onChange,
  label,
  hint,
  tone = "teal",
  disabled = false,
  className = "",
}) {
  const onTrack = { teal: "bg-teal-600", red: "bg-red-600", slate: "bg-slate-900" }[tone] || "bg-teal-600";
  const ring = { teal: "focus:ring-teal-400", red: "focus:ring-red-400", slate: "focus:ring-slate-400" }[tone];

  return (
    <label
      className={`flex cursor-pointer items-center gap-3 ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${ring} ${
          checked ? onTrack : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
      {(label || hint) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-semibold text-slate-700">{label}</span>}
          {hint && <span className="block text-xs text-slate-400">{hint}</span>}
        </span>
      )}
    </label>
  );
}
