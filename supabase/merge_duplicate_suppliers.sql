-- ============================================================================
-- Merge duplicate suppliers into one row per company. Run once in the Supabase
-- SQL editor. Safe to re-run.
--
-- Handles the case where the KSeF fetch created a row under the invoice's LEGAL
-- name (with a NIP) while a curated row for the same company exists with a BLANK
-- NIP:
--   Step 0 fills those blank NIPs by matching name / legal name.
--   Steps 1-4 then merge every group that shares a NIP into a single survivor,
--   repoint all references, and delete the duplicates.
--
-- Survivor per NIP = the SHORTEST name (curated short names beat legal names),
-- tie-broken by oldest, then lowest id.
-- ============================================================================

-- ── Step 0: fill blank NIPs from a matching row that has one ─────────────────
update public.suppliers s
set nip = src.nip
from public.suppliers src
where nullif(btrim(s.nip), '') is null
  and nullif(btrim(src.nip), '') is not null
  and s.id <> src.id
  and (
    lower(btrim(s.name)) = lower(btrim(src.ksef_name))
    or lower(btrim(s.name)) = lower(btrim(src.name))
    or (nullif(btrim(s.ksef_name), '') is not null and lower(btrim(s.ksef_name)) = lower(btrim(src.name)))
    or (nullif(btrim(s.ksef_name), '') is not null and lower(btrim(s.ksef_name)) = lower(btrim(src.ksef_name)))
  );

-- ── Step 1: choose a survivor per NIP ───────────────────────────────────────
drop table if exists _sup_merge;
create temp table _sup_merge as
with ranked as (
  select id, first_value(id) over w as keep_id
  from public.suppliers
  where nullif(btrim(nip), '') is not null
  window w as (
    partition by btrim(nip)
    order by length(coalesce(name, '')) asc, created_at asc, id asc
  )
)
select id as loser_id, keep_id from ranked where id <> keep_id;

-- ── Step 2: enrich the survivor with non-empty values from its losers ───────
update public.suppliers s set
  ksef_name = coalesce(nullif(s.ksef_name, ''), agg.ksef_name),
  email     = coalesce(nullif(s.email, ''),     agg.email),
  phone     = coalesce(nullif(s.phone, ''),     agg.phone),
  address   = coalesce(nullif(s.address, ''),   agg.address),
  notes     = coalesce(nullif(s.notes, ''),     agg.notes)
from (
  select m.keep_id,
    max(nullif(btrim(l.ksef_name), '')) as ksef_name,
    max(nullif(btrim(l.email), ''))     as email,
    max(nullif(btrim(l.phone), ''))     as phone,
    max(nullif(btrim(l.address), ''))   as address,
    max(nullif(btrim(l.notes), ''))     as notes
  from _sup_merge m
  join public.suppliers l on l.id = m.loser_id
  group by m.keep_id
) agg
where s.id = agg.keep_id;

-- ── Step 3: repoint everything that references a loser to the survivor ──────
update public.invoices        x set supplier_id         = m.keep_id from _sup_merge m where x.supplier_id = m.loser_id;
update public.items           x set primary_supplier_id = m.keep_id from _sup_merge m where x.primary_supplier_id = m.loser_id;
update public.ksef_mappings   x set supplier_id         = m.keep_id from _sup_merge m where x.supplier_id = m.loser_id;
update public.invoice_details x set supplier_id         = m.keep_id from _sup_merge m where x.supplier_id = m.loser_id;

-- ── Step 4: delete the now-orphaned duplicates ──────────────────────────────
delete from public.suppliers s using _sup_merge m where s.id = m.loser_id;

-- Report
select count(*) as merged_rows from _sup_merge;
drop table _sup_merge;

-- If Step 3 errors on invoices_supplier_id_number_key, two rows genuinely hold
-- the same invoice number under different supplier rows — resolve those invoices
-- first, then re-run.
