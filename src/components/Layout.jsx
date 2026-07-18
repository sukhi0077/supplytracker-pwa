// src/components/Layout.jsx
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/masterdata", label: "Master data" },
  { to: "/invoices", label: "Invoices" },
  { to: "/invoice-details", label: "Invoice details" },
  { to: "/ksef-mappings", label: "KSeF mappings" },
  { to: "/stock", label: "Stock" },
  { to: "/sales-report", label: "Sales report" },
];

export default function Layout({ user, isAdmin, adminError, onLogout }) {
  const [open, setOpen] = useState(false);

  const linkClass = ({ isActive }) =>
    `block rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive
        ? "bg-slate-900 text-white"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  const nav = (
    <nav className="space-y-1">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={linkClass} onClick={() => setOpen(false)}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top bar (mobile) */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          aria-label="Toggle menu"
        >
          ☰
        </button>
        <span className="font-bold">SupplyTracker</span>
        <span className="w-9" />
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Sidebar */}
        <aside
          className={`${
            open ? "block" : "hidden"
          } lg:block w-full lg:w-60 shrink-0 border-r border-slate-200 bg-white p-4 lg:min-h-screen`}
        >
          <div className="mb-4 hidden lg:block">
            <div className="text-lg font-bold">SupplyTracker</div>
            <div className="text-xs text-slate-400">shared DB · PWA</div>
          </div>

          {nav}

          <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
            <div className="truncate" title={user?.email}>
              {user?.email}
            </div>
            <div className="mt-1">
              {isAdmin ? (
                <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                  admin
                </span>
              ) : (
                <span className="inline-block rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                  staff (read-only)
                </span>
              )}
            </div>
            {adminError && !isAdmin && (
              <div className="mt-2 text-[11px] text-amber-600">{adminError}</div>
            )}
            <button
              onClick={onLogout}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
