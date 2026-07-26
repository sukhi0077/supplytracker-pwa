-- ============================================================================
-- Import suppliers from the OLD Postgres into the shared Supabase DB.
--
-- Same pattern as the KSeF-mapping importer: run PART A in pgAdmin (old DB) to
-- GENERATE a ready-to-run Supabase upsert, then paste that output into the
-- Supabase SQL editor and run it. Upserts on suppliers.name (unique); existing
-- rows (e.g. suppliers auto-created by the KSeF fetch) are enriched, not dupl-
-- icated when names match. Carries all supplier fields.
-- ============================================================================

-- ── PART A — run in pgAdmin (old DB). Outputs one cell = the Supabase script. ──
select format(
$tmpl$insert into public.suppliers
  (name, ksef_name, nip, address, email, phone, notes,
   payment_terms_days, min_order_value, iban, delivery_days, cutoff_time, active)
values
%s
on conflict (name) do update set
  ksef_name          = excluded.ksef_name,
  nip                = coalesce(nullif(excluded.nip, ''), public.suppliers.nip),
  address            = excluded.address,
  email              = excluded.email,
  phone              = excluded.phone,
  notes              = excluded.notes,
  payment_terms_days = excluded.payment_terms_days,
  min_order_value    = excluded.min_order_value,
  iban               = excluded.iban,
  delivery_days      = excluded.delivery_days,
  cutoff_time        = excluded.cutoff_time,
  active             = excluded.active;$tmpl$,
  (select string_agg(
     format('  (%L,%L,%L,%L,%L,%L,%L,%s,%s,%L,%L,%s,%s)',
       s.name,
       coalesce(s.ksef_name, ''),
       coalesce(s.nip, ''),
       coalesce(s.address, ''),
       coalesce(s.email, ''),
       coalesce(s.phone, ''),
       coalesce(s.notes, ''),
       coalesce(s.payment_terms_days::text, 'null'),
       coalesce(s.min_order_value::text, 'null'),
       coalesce(s.iban, ''),
       coalesce(s.delivery_days, ''),
       case when s.cutoff_time is null then 'null' else quote_literal(s.cutoff_time::text) end,
       case when s.is_active then 'true' else 'false' end),
     E',\n' order by s.name)
   from core_supplier s)
) as supabase_sql;

-- ── PART B — paste the single output cell into the Supabase SQL editor & Run. ──
-- (It is the full INSERT … ON CONFLICT above, populated with your rows.)

-- Verify afterwards, in Supabase:
--   select count(*) from public.suppliers;
--   select name, ksef_name, nip, email from public.suppliers order by name;
