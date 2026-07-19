-- =============================================================================
-- SupplyTracker PWA — schema merge onto the shared Order & Stock database
--
-- This file is ADDITIVE and IDEMPOTENT. It assumes order-stock-pwa's schema.sql
-- has ALREADY been applied to the SAME Supabase project, so these exist:
--   public.profiles, public.is_admin(), public.items, public.suppliers,
--   public.categories, public.sub_categories, public.units
--
-- It brings the SupplyTracker (Django) domain into that one database by:
--   (A) adding SupplyTracker's extra columns to the shared items / suppliers,
--   (B) creating the SupplyTracker-only tables (invoices, stock, mappings, …),
--   (C) replacing Django's StockLevel signal with a Postgres trigger,
--   (D) enabling RLS on everything: authenticated READ, admin WRITE.
--
-- Deliberately OMITTED to stay on the free tier / keep it lean:
--   * Invoice.raw_xml  (would bloat the 500 MB DB — store XML in R2 if needed)
--   * simple_history "historical*" tables
--
-- HOW TO APPLY
--   Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--   Safe to re-run.
-- =============================================================================

-- =============================================================================
-- A. EXTEND THE SHARED TABLES
-- =============================================================================

-- ---- items: SupplyTracker's catalogue fields --------------------------------
-- Shared already has: code, name, category/sub_category/unit (+ *_id FKs),
-- vat_rate (default 23), match_keywords, active.
-- Map at the app boundary: default_unit -> unit_id, default_vat_rate -> vat_rate,
-- is_active -> active, sub_category (FK) -> sub_category_id, primary supplier ->
-- primary_supplier_id. UNIT IS NORMALISED to the single items.unit_id FK — the
-- old default_uom_id / uom_code columns are removed (see the drop block below).
alter table public.items add column if not exists reorder_frequency_days int;
alter table public.items add column if not exists last_ordered_at        date;
alter table public.items add column if not exists primary_supplier_id    uuid references public.suppliers(id) on delete set null;
alter table public.items add column if not exists notes                  text not null default '';
-- Two-level active flag: `active` is the MASTER flag (owned here, in SupplyTracker
-- — disabling hides the item in BOTH apps). `osp_active` is Order & Stock's LOCAL
-- disable (owned by that app — never touched here). SupplyTracker reads/writes
-- only `active`.
alter table public.items add column if not exists osp_active             boolean not null default true;
create index if not exists items_primary_supplier_idx on public.items (primary_supplier_id);

-- Drop the redundant unit columns (self-healing if order-stock's schema.sql
-- hasn't been re-run yet): fold any value into the single items.unit_id first.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='items' and column_name='default_uom_id') then
    update public.items set unit_id = default_uom_id where unit_id is null and default_uom_id is not null;
    drop index if exists public.items_default_uom_idx;
    alter table public.items drop column default_uom_id;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='items' and column_name='uom_code') then
    alter table public.items drop column uom_code;
  end if;
end $$;

-- ---- suppliers: SupplyTracker's operational fields --------------------------
-- Shared already has: name (unique), active, nip, ksef_name.
alter table public.suppliers add column if not exists address            text not null default '';
alter table public.suppliers add column if not exists email              text not null default '';
alter table public.suppliers add column if not exists phone              text not null default '';
alter table public.suppliers add column if not exists notes              text not null default '';
alter table public.suppliers add column if not exists payment_terms_days int;
alter table public.suppliers add column if not exists min_order_value    numeric(12,2);
alter table public.suppliers add column if not exists iban               text not null default '';
alter table public.suppliers add column if not exists delivery_days      text not null default '';
alter table public.suppliers add column if not exists cutoff_time        time;
create index if not exists suppliers_nip_idx       on public.suppliers (nip);
create index if not exists suppliers_ksef_name_idx on public.suppliers (ksef_name);

-- =============================================================================
-- B. NEW TABLES (SupplyTracker-only domains)
-- =============================================================================

-- ---- unit_conversions: global + per-item pack sizes ------------------------
-- item_id NULL => global (e.g. 1 kg = 1000 g). item_id set => per-item pack.
create table if not exists public.unit_conversions (
  id           uuid primary key default gen_random_uuid(),
  from_unit_id uuid not null references public.units(id) on delete restrict,
  to_unit_id   uuid not null references public.units(id) on delete restrict,
  factor       numeric(18,6) not null check (factor > 0),
  item_id      uuid references public.items(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);
create unique index if not exists uconv_global_uq on public.unit_conversions (from_unit_id, to_unit_id)
  where item_id is null;
create unique index if not exists uconv_item_uq on public.unit_conversions (from_unit_id, to_unit_id, item_id)
  where item_id is not null;
create index if not exists uconv_item_idx on public.unit_conversions (item_id);

-- ---- ksef_mappings: KSeF invoice item text -> catalogue item ---------------
create table if not exists public.ksef_mappings (
  id             uuid primary key default gen_random_uuid(),
  ksef_item_name text not null,
  item_id        uuid not null references public.items(id) on delete restrict,
  supplier_id    uuid references public.suppliers(id) on delete restrict,
  pack_size      numeric(12,4) not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);
-- Unique on (ksef_item_name, supplier_id). A NULL supplier is a global mapping;
-- coalesce so only one global row per name is allowed too.
create unique index if not exists ksef_mappings_uq
  on public.ksef_mappings (ksef_item_name, coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists ksef_mappings_name_idx on public.ksef_mappings (ksef_item_name);
create index if not exists ksef_mappings_item_idx on public.ksef_mappings (item_id);

-- ---- invoices ---------------------------------------------------------------
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  number         text not null,
  ksef_reference text not null default '',
  supplier_id    uuid not null references public.suppliers(id) on delete restrict,
  issue_date     date not null,
  sale_date      date,
  due_date       date,
  payment_date   date,
  currency       text not null default 'PLN',
  net_total      numeric(12,2) not null default 0,
  vat_total      numeric(12,2) not null default 0,
  gross_total    numeric(12,2) not null default 0,
  status         text not null default 'fetched'
                 check (status in ('draft','fetched','matched','mismatch','paid')),
  match_status   text not null default '',
  -- wFirma mirror (populated by the wFirma Worker; read-only in the app)
  wfirma_id             text not null default '',
  wfirma_payment_status text not null default '',
  wfirma_remaining      numeric(12,2),
  wfirma_status         text not null default '',
  wfirma_synced_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  unique (supplier_id, number)
);
create index if not exists invoices_issue_date_idx on public.invoices (issue_date desc);
create index if not exists invoices_supplier_idx   on public.invoices (supplier_id);
create index if not exists invoices_ksef_ref_idx   on public.invoices (ksef_reference);
create index if not exists invoices_number_idx     on public.invoices (number);

-- ---- invoice_lines ----------------------------------------------------------
create table if not exists public.invoice_lines (
  id                 uuid primary key default gen_random_uuid(),
  invoice_id         uuid not null references public.invoices(id) on delete cascade,
  line_no            int not null,
  item_id            uuid references public.items(id) on delete restrict,
  ksef_item_name_raw text not null default '',
  quantity           numeric(12,3) not null default 0,
  unit               text not null default 'szt',
  net_unit           numeric(12,4),
  gross_unit         numeric(12,4),
  net_total          numeric(12,2),
  vat_amount         numeric(12,2),
  gross_total        numeric(12,2),
  vat_rate           numeric(5,2),
  discount           numeric(12,2) not null default 0,
  pack_size          numeric(12,4) not null default 1,
  gross_estimated    boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  unique (invoice_id, line_no)
);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id);
create index if not exists invoice_lines_item_idx    on public.invoice_lines (item_id);

-- ---- invoice_details: the purchase / orders log (Django InvoiceDetail) ------
create table if not exists public.invoice_details (
  id                uuid primary key default gen_random_uuid(),
  order_date        date not null,
  supplier_id       uuid not null references public.suppliers(id) on delete restrict,
  item_id           uuid references public.items(id) on delete set null,
  quantity          numeric(12,3) not null default 0,
  pack_size         numeric(12,4) not null default 1,
  unit_price_net    numeric(12,4),
  unit_price_gross  numeric(12,4),
  line_total_net    numeric(12,2),
  line_total_gross  numeric(12,2),
  invoice_id        uuid references public.invoices(id) on delete set null,
  invoice_line_id   uuid references public.invoice_lines(id) on delete cascade,
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  unique (invoice_line_id)
);
create index if not exists invoice_details_date_item_idx     on public.invoice_details (order_date, item_id);
create index if not exists invoice_details_date_supplier_idx on public.invoice_details (order_date, supplier_id);

-- ---- stock_levels: current qty per item (1:1) ------------------------------
create table if not exists public.stock_levels (
  item_id       uuid primary key references public.items(id) on delete cascade,
  current_qty   numeric(14,3) not null default 0,
  reorder_point numeric(14,3),
  par_level     numeric(14,3),
  safety_stock  numeric(14,3),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

-- ---- stock_movements: signed stock events ----------------------------------
create table if not exists public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.items(id) on delete restrict,
  qty             numeric(14,3) not null,  -- signed: + into stock, - out
  kind            text not null
                  check (kind in ('purchase_in','sale_out','waste','transfer',
                                  'adjustment','prep','opening','count')),
  invoice_id      uuid references public.invoices(id) on delete set null,
  invoice_line_id uuid references public.invoice_lines(id) on delete cascade,
  happened_at     date not null,
  by_user         uuid references auth.users(id) on delete set null,
  notes           text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists stock_movements_item_date_idx on public.stock_movements (item_id, happened_at);
create index if not exists stock_movements_kind_date_idx on public.stock_movements (kind, happened_at);

-- ---- sales_records: monthly sales upload -----------------------------------
create table if not exists public.sales_records (
  id         uuid primary key default gen_random_uuid(),
  month      text not null,          -- 'YYYY-MM'
  category   text not null default '',
  item_name  text not null default '',
  status     text not null default '',
  units      int not null default 0,
  revenue    numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (month, category, item_name)
);
create index if not exists sales_records_month_idx      on public.sales_records (month);
create index if not exists sales_records_month_cat_idx  on public.sales_records (month, category);
-- Best-effort link to the catalogue. Sales rows are an EXTERNAL POS upload whose
-- (month, category, item_name) stays the natural key + raw label; item_id adds a
-- normalised FK where the uploaded item_name matches a catalogue item by name.
alter table public.sales_records add column if not exists item_id uuid references public.items(id) on delete set null;
create index if not exists sales_records_item_idx on public.sales_records (item_id);
update public.sales_records sr set item_id = i.id
  from public.items i
  where sr.item_id is null and lower(btrim(sr.item_name)) = lower(i.name);

-- ---- KSeF integration state (for the deferred Cloudflare Worker phase) ------
-- ksef_credentials / ksef_auth_tokens hold SECRETS. RLS is enabled with NO
-- client policies below => the publishable key can neither read nor write them.
-- Only the Worker (service-role key, which bypasses RLS) touches them.
create table if not exists public.ksef_credentials (
  id              uuid primary key default gen_random_uuid(),
  environment     text not null unique check (environment in ('test','demo','prod')),
  nip             text not null,
  token_encrypted text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

create table if not exists public.ksef_auth_tokens (
  id            uuid primary key default gen_random_uuid(),
  environment   text not null default 'test' check (environment in ('test','demo','prod')),
  nip           text not null,
  session_token text not null,
  issued_at     timestamptz not null,
  expires_at    timestamptz not null,
  is_revoked    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists ksef_auth_tokens_env_idx on public.ksef_auth_tokens (environment, issued_at desc);

-- Run history for KSeF fetches — admins may READ this (no secrets in it).
create table if not exists public.ksef_fetch_jobs (
  id                uuid primary key default gen_random_uuid(),
  status            text not null default 'running'
                    check (status in ('running','success','partial','failed')),
  environment       text not null default 'test',
  date_from         date not null,
  date_to           date not null,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  invoices_found    int not null default 0,
  invoices_created  int not null default 0,
  invoices_updated  int not null default 0,
  invoices_skipped  int not null default 0,
  error_count       int not null default 0,
  error_log         text not null default '',
  notes             text not null default ''
);
create index if not exists ksef_fetch_jobs_started_idx on public.ksef_fetch_jobs (started_at desc);

-- =============================================================================
-- C. STOCK TRIGGER  (replaces Django's StockLevel post_save/post_delete signal)
--   Every stock_movements INSERT adds qty into stock_levels.current_qty;
--   every DELETE reverses it. Keeps current_qty correct with no app code.
-- =============================================================================
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.stock_levels (item_id, current_qty, updated_at)
      values (new.item_id, new.qty, now())
    on conflict (item_id) do update
      set current_qty = public.stock_levels.current_qty + new.qty,
          updated_at  = now();
    return new;
  elsif tg_op = 'DELETE' then
    update public.stock_levels
      set current_qty = current_qty - old.qty,
          updated_at  = now()
      where item_id = old.item_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists stock_movements_apply_ins on public.stock_movements;
create trigger stock_movements_apply_ins
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

drop trigger if exists stock_movements_apply_del on public.stock_movements;
create trigger stock_movements_apply_del
  after delete on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- =============================================================================
-- D. ROW-LEVEL SECURITY  (authenticated READ, admin WRITE — via is_admin())
-- =============================================================================
alter table public.unit_conversions enable row level security;
alter table public.ksef_mappings    enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_lines    enable row level security;
alter table public.invoice_details  enable row level security;
alter table public.stock_levels     enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.sales_records    enable row level security;
alter table public.ksef_credentials enable row level security;  -- no policies = locked to service-role only
alter table public.ksef_auth_tokens enable row level security;  -- no policies = locked to service-role only
alter table public.ksef_fetch_jobs  enable row level security;

-- Helper pattern applied to each "read-all / admin-write" table.
do $$
declare
  t text;
  read_admin_write text[] := array[
    'unit_conversions','ksef_mappings','invoices','invoice_lines',
    'invoice_details','stock_levels','stock_movements','sales_records'
  ];
begin
  foreach t in array read_admin_write loop
    execute format('drop policy if exists %I_read on public.%I;', t, t);
    execute format(
      'create policy %I_read on public.%I for select to authenticated using (true);', t, t);
    execute format('drop policy if exists %I_admin_write on public.%I;', t, t);
    execute format(
      'create policy %I_admin_write on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin());',
      t, t);
  end loop;
end $$;

-- Fetch-job history: admins may read; writes come from the Worker (service role).
drop policy if exists ksef_fetch_jobs_read on public.ksef_fetch_jobs;
create policy ksef_fetch_jobs_read on public.ksef_fetch_jobs
  for select to authenticated using (public.is_admin());

-- =============================================================================
-- DONE. Both apps now share one database. order-stock-pwa keeps capturing
-- counts/orders/receipts; SupplyTracker PWA manages the catalogue, suppliers,
-- invoices, mappings and stock on top of the same tables.
-- =============================================================================
