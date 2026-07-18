// src/components/ui/parts.jsx
// Small shared building blocks so pages stay compact and consistent.
import Spinner from "./Spinner.jsx";

export function PageHeader({ title, subtitle, right }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white ${className}`}>{children}</div>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div className="flex items-center gap-3 py-12 text-slate-500">
      <Spinner className="h-5 w-5" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBox({ error }) {
  const msg = error?.message || String(error);
  const rls = /row-level security|permission|denied/i.test(msg);
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <div className="font-semibold">Couldn't load this.</div>
      <div className="mt-1">{msg}</div>
      {rls && (
        <div className="mt-2 text-red-600">
          If the tables don't exist yet, run <code>supabase/schema.sql</code> in the Supabase SQL
          editor first.
        </div>
      )}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="py-12 text-center text-sm text-slate-400">{children}</div>;
}

const PILL = {
  ok: "bg-emerald-100 text-emerald-700",
  low: "bg-amber-100 text-amber-700",
  critical: "bg-orange-100 text-orange-700",
  out: "bg-red-100 text-red-700",
  paid: "bg-emerald-100 text-emerald-700",
  matched: "bg-emerald-100 text-emerald-700",
  mismatch: "bg-orange-100 text-orange-700",
  fetched: "bg-sky-100 text-sky-700",
  draft: "bg-slate-100 text-slate-600",
};

export function Pill({ value }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        PILL[value] || "bg-slate-100 text-slate-600"
      }`}
    >
      {value}
    </span>
  );
}

export function ComingSoon({ title, children }) {
  return (
    <div>
      <PageHeader title={title} />
      <Card className="p-8 text-center">
        <div className="mx-auto max-w-md space-y-3">
          <div className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
            planned — next phase
          </div>
          <p className="text-sm text-slate-600">{children}</p>
        </div>
      </Card>
    </div>
  );
}
