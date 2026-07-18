# SupplyTracker PWA

A Progressive Web App port of SupplyTracker that runs on the **same Supabase
database** as `order-stock-pwa`. Both apps share one Postgres project, one set of
users, and the same `items` / `suppliers` / `categories` / `sub_categories` /
`units` tables. See `../supplytracker-pwa-PLAN.md` for the full plan.

## Stack

- React 19 + Vite + Tailwind, installable **PWA** (`vite-plugin-pwa`)
- `@supabase/supabase-js` straight from the browser (no server)
- `@tanstack/react-query` for data fetching, `react-router-dom` for pages
- Security enforced by **Row-Level Security** in Postgres — authenticated users
  read, admins write. Same `profiles` / `is_admin()` model as order-stock-pwa.

## What's in this build (Phases 0–6)

- **App shell:** login (shared Supabase auth), admin/staff gating, sidebar nav, PWA.
- **Catalogue:** Items + Suppliers with full admin add/edit editors, search,
  activate/deactivate.
- **Master data:** categories, sub-categories, units — view + admin add.
- **Invoices:** list, manual invoice entry (header + lines, computed totals),
  read-only invoice view. **Invoice details:** the purchase/orders log with add.
- **KSeF mappings:** full CRUD (invoice-text → catalogue item).
- **Stock:** current levels + status, stock-movement entry (trigger keeps levels),
  recent-movements feed.
- **Sales report:** JSON/CSV upload → `sales_records` (idempotent), month filter.
- `supabase/schema.sql` — additive, idempotent schema merge (Phase 1).
- `workers/` — Cloudflare Worker for **KSeF fetch + wFirma sync** (Phase 4;
  typechecks clean, deploy when ready — see `workers/README.md`).
- `supabase/MIGRATION.md` — moving existing Django data in (Phase 5, if needed).
- `DEPLOYMENT.md` — Pages + Workers + Supabase, all free tier (Phase 6).

## 1. Apply the schema

Run **order-stock-pwa's** `supabase/schema.sql` first (if not already), then this
app's schema on the **same** project:

Supabase Dashboard → SQL Editor → paste `supabase/schema.sql` → Run. It's
additive and idempotent (safe to re-run). It extends the shared `items` /
`suppliers` and adds the SupplyTracker tables (invoices, stock, mappings, …).

## 2. Configure & run

```bash
cp .env.example .env      # fill in the SAME project's URL + publishable key
npm install
npm run dev               # http://localhost:5173
npm run build             # production build -> dist/
```

> Use the **publishable** key (`sb_publishable_…`), never a secret/service_role
> key. RLS makes the publishable key safe to ship.

Make yourself admin (once), in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

## 3. Deploy

Cloudflare Pages, same as order-stock-pwa: build command `npm run build`, output
`dist/`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Pages
project's environment variables.

## Notes / by design

- **KSeF fetch & wFirma sync** are built in `workers/` but **deploy-when-ready**:
  the KSeF endpoint paths must be confirmed against the current KSeF 2.0 spec
  (see `workers/README.md`). The PWA is fully usable with manual invoice entry
  meanwhile.
- **Invoice `raw_xml`** is intentionally not stored in the DB, to stay under
  Supabase's free 500 MB (offload XML to R2 later if needed).
- **History tables** (`simple_history`) are dropped.

## Staying on the free tier

Keep the DB under 500 MB (no raw XML), keep order-stock-pwa's
`keepalive.yml` running so the free Supabase project doesn't pause, and chunk the
future KSeF Worker job so it fits free Workers limits. Details in §8 of the plan.
