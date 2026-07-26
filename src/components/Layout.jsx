// src/components/Layout.jsx
//
// Desktop: a static sidebar in the page flow.
// Mobile: the same nav as a fixed overlay drawer.
//
// The drawer used to be an inline `block w-full` aside inside the flex row, so
// opening it just expanded something *in the document* — if you'd scrolled down
// you couldn't see it without scrolling back up, and it got squeezed next to
// the main column. Being `fixed` means it's always on screen, full height, at
// full width, wherever you happen to be scrolled to.
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/masterdata", label: "Master data" },
  { to: "/download-ksef", label: "Download KSeF" },
  { to: "/invoices", label: "Invoices" },
  { to: "/invoice-details", label: "Invoice details" },
  { to: "/ksef-mappings", label: "KSeF mappings" },
  { to: "/stock", label: "Stock" },
  { to: "/sales-report", label: "Sales report" },
];

export default function Layout({ user, isAdmin, adminError, onLogout }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the drawer and go back to the top whenever the route changes —
  // otherwise you land mid-page on the new screen.
  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // While the drawer is open: lock the page behind it and let Escape close it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const linkClass = ({ isActive }) =>
    `block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top bar (mobile) */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-lg leading-none"
          aria-label="Open menu"
          aria-expanded={open}
        >
          ☰
        </button>
        <span className="font-bold">SupplyTracker</span>
        <span className="w-11" />
      </header>

      {/* Backdrop (mobile only, while open) */}
      {open && (
        <button
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="mx-auto flex max-w-7xl">
        {/* Sidebar / drawer */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-xs flex-col overflow-y-auto overscroll-contain border-r border-slate-200 bg-white p-4 shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:w-60 lg:max-w-none lg:translate-x-0 lg:shadow-none lg:transition-none ${
            open ? "translate-x-0" : "pointer-events-none -translate-x-full lg:pointer-events-auto"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-bold">SupplyTracker</div>
              <div className="text-xs text-slate-400">shared DB · PWA</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <nav className="space-y-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={linkClass} onClick={() => setOpen(false)}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div
            className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
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
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
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
