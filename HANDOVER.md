# SupplyTracker PWA — Session Handover

**What it is.** A React 19 + Vite PWA (`supplytracker-pwa`) that ports the old
Django SupplyTracker onto the **same Supabase Postgres** that `order-stock-pwa`
uses. Server-side KSeF/wFirma work runs in a **Cloudflare Worker** (`workers/`).
Deploys on **Cloudflare Pages** (frontend) + **Cloudflare Workers**, all free-tier.

## Stack / architecture
- Frontend: React 19, Vite, Tailwind, react-router, @tanstack/react-query,
  @supabase/supabase-js, **recharts** (dashboard). PWA via vite-plugin-pwa.
- Auth: Supabase email/password; role in `public.profiles` (staff/admin), RLS
  enforced in DB. Admin = write.
- Worker: TypeScript, `fast-xml-parser`, wrangler v4 / workers-types v5. Writes
  with the Supabase **service-role** key. Deployed at
  `https://supplytracker-workers.misahindusa-orders.workers.dev`.
- Supabase project: `ghzchiityizvkranlnxw` (URL in `.env` / Pages env vars).

## Data model notes
- **Normalized catalogue**: `items` store `category_id / sub_category_id / unit_id`
  (FKs) — the old text columns were DROPPED. Names are resolved **client-side**
  from master tables (`useItems()` returns blank name strings; each page maps ids
  → names). Repos use `select("*")`, never joins on those columns.
- **Two active flags**: `items.active` = master (SupplyTracker owns it, hides in
  both apps). `items.osp_active` = order-stock local disable. Order & Stock's
  effective active = `active AND osp_active`.
- KSeF invoices → `invoices` + `invoice_lines` (Invoice details page shows lines).
  Manual invoices have blank `ksef_reference`; KSeF ones set it.

## KSeF (working end-to-end, TEST env)
- Auth flow (challenge → ksef-token → poll → redeem) uses `contextIdentifier
  { type:"Nip", value }`; RSA-OAEP-SHA256 via Web Crypto; the encryption cert is
  **auto-fetched** from `/security/public-key-certificates` (no PEM secret).
- Endpoints: `/invoices/query/metadata` (Subject2 = purchases) + download
  `/invoices/ksef/{ksefNumber}`.
- **Free-tier**: capped at **8 new invoices per run** (50-subrequest limit);
  re-run / cron catches up (`remaining` reported).
- Worker endpoints: `POST /auth-test`, `/run/ksef`, `/run/wfirma`; auth = admin
  Supabase JWT **or** `x-trigger-secret`; body `{nip, token, environment}`.
- Supplier resolution merges on NIP; fills blank NIPs by name.

## Deploy checklist
- Pages env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_KSEF_WORKER_URL` (= the hyphenated worker URL). **Rebuild after any env
  change** (Vite inlines them).
- Worker secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (required);
  optional `KSEF_NIP/KSEF_TOKEN` (cron), `TRIGGER_SECRET` (curl), wFirma creds.
  `wrangler.toml [vars]` still points at TEST — switch `KSEF_BASE_URL`/`KSEF_ENV`
  to prod for the cron.
- When deps change, run `npm install` and commit `package-lock.json` (Cloudflare
  uses `npm ci`, which fails on a stale lockfile).

## One-time SQL (Supabase editor) — in `supabase/`
- `schema.sql` — the additive merge schema (run after order-stock schema).
- `import_ksef_mappings_full.sql` — clean + load all KSeF mappings from old DB
  (pgAdmin generator → paste output; carries pack + supplier).
- `import_suppliers.sql` — pgAdmin generator → upsert old suppliers by name.
- `merge_duplicate_suppliers.sql` — fill blank NIPs + merge dup suppliers by NIP.
- match_keywords: pgAdmin generator was provided in chat (update `items` by code).

## Known gaps / watch-items
- **FA(3) XML parsing** is the one piece not verified against a live prod invoice
  (auth/query verified). If prod amounts/lines look off, tune `workers/src/ksef/
  parser.ts` tags.
- Unused leftover files: `ItemEditor.jsx`, `SupplierEditor.jsx` (modal editors,
  superseded by inline forms).
- Sandbox couldn't delete files/git locks on the mounted FS; that's environment-
  only (doesn't affect the real repo).

## Recent work (newest first)
- Edit manual invoices; mobile layouts (details cards, add-invoice reflow, VAT 5%
  default); Download KSeF = 3rd tab + overlapping 8-day week presets; Master data
  "Enable delete" gate; supplier structure+data match + NIP merge; dashboard
  analytics; invoice-details line view + fuzzy suggestions + remap dialog; full
  KSeF pipeline (auth → query → download → parse → upsert).

## Repo map
- `src/pages/` — Dashboard, Items, Suppliers, MasterData (tabbed hub),
  Invoices, InvoiceDetails, KsefMappings, DownloadKsef, Stock, SalesReport.
- `src/repositories/` + `src/hooks/useCatalogue.js` — data layer.
- `src/utils/ksefMatch.js` — client port of the backend suggestion scorer.
- `workers/src/` — `index.ts`, `ksef/{client,parser,matching,money,sync,cert}.ts`,
  `wfirma/{client,sync}.ts`, `lib/{supabase,auth}.ts`.
- Two apps share the DB; also see `order-stock-pwa` (its schema.sql is the base).
