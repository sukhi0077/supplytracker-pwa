// src/components/ui/Spinner.jsx
export default function Spinner({ className = "" }) {
  return (
    <div
      className={`h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
