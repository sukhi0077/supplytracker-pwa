-- ============================================================================
-- KSeF mappings: REPLACE the Supabase table with the LIVE data from the old DB.
--
-- This CLEANS public.ksef_mappings entirely, then loads every mapping from the
-- old Postgres export, carrying pack_size + supplier. The old DB is the single
-- source of truth here; the repo CSV (old_ksef_mappings.csv) is NOT used because
-- it doesn't contain pack sizes.
--
-- Everything lands in the shared Supabase database (the SupplyTracker system of
-- record) — table public.ksef_mappings.
--
-- ── STEP A ── Export from the old Postgres (run where that DB is reachable):
--   psql "$DATABASE_URL" -c "\copy ( \
--     select m.ksef_item_name, it.name as item_name, it.code as item_code, \
--            s.name as supplier_name, s.nip as supplier_nip, m.pack_size \
--     from core_ksefmapping m \
--     join core_item it     on it.id = m.item_id \
--     left join core_supplier s on s.id = m.supplier_id \
--   ) to 'ksef_mappings_live.csv' with csv header"
--
-- ── STEP B ── Supabase SQL editor: run PART 1 (creates + clears staging).
-- ── STEP C ── Supabase Table Editor: open public.ksef_import_staging ->
--              Insert -> Import data from CSV -> upload ksef_mappings_live.csv
--              (headers map by name; column order doesn't matter).
-- ── STEP D ── Supabase SQL editor: run PART 2 (cleans + loads).
-- ============================================================================

-- ─────────────────────────── PART 1: staging table ─────────────────────────
create table if not exists public.ksef_import_staging (
  ksef_item_name text,
  item_name      text,
  item_code      text,
  supplier_name  text,
  supplier_nip   text,
  pack_size      numeric
);
truncate public.ksef_import_staging;   -- now upload the CSV into it (STEP C)


-- ─────────── PART 2: clean the target, then load from the old DB ────────────
-- 1) CLEAN — remove everything currently in the Supabase mappings table.
delete from public.ksef_mappings;

-- 2) LOAD — resolve item (by code, then name) + supplier (by NIP, then name),
--    carry pack_size, and insert. DISTINCT ON guards against any accidental
--    duplicate (ksef_item_name, supplier) collisions in the export.
with resolved as (
  select
    btrim(s.ksef_item_name) as ksef_item_name,
    coalesce(
      (select i.id from public.items i where s.item_code is not null and i.code = btrim(s.item_code) limit 1),
      (select i.id from public.items i where lower(i.name) = lower(btrim(s.item_name)) limit 1)
    ) as item_id,
    (select sup.id from public.suppliers sup
       where (nullif(btrim(s.supplier_nip), '')  is not null and sup.nip = btrim(s.supplier_nip))
          or (nullif(btrim(s.supplier_name), '') is not null and lower(sup.name) = lower(btrim(s.supplier_name)))
       limit 1) as supplier_id,
    coalesce(nullif(s.pack_size, 0), 1) as pack_size
  from public.ksef_import_staging s
  where nullif(btrim(s.ksef_item_name), '') is not null
)
insert into public.ksef_mappings (ksef_item_name, item_id, supplier_id, pack_size)
select distinct on (r.ksef_item_name, coalesce(r.supplier_id, '00000000-0000-0000-0000-000000000000'::uuid))
  r.ksef_item_name, r.item_id, r.supplier_id, r.pack_size
from resolved r
where r.item_id is not null
order by r.ksef_item_name,
         coalesce(r.supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
         r.pack_size desc;

-- ─────────────────────────────── diagnostics ───────────────────────────────
select
  (select count(*) from public.ksef_import_staging)                                as staged_rows,
  (select count(*) from public.ksef_mappings)                                      as loaded_mappings,
  (select count(*) from public.ksef_mappings where pack_size <> 1)                 as mappings_with_pack,
  (select count(*) from public.ksef_mappings where supplier_id is not null)        as supplier_specific;

-- Staged rows whose item did NOT match (fix name/code, re-upload, re-run PART 2):
select distinct s.item_name, s.item_code, s.ksef_item_name
from public.ksef_import_staging s
left join public.items i
  on lower(i.name) = lower(btrim(s.item_name))
     or (s.item_code is not null and i.code = btrim(s.item_code))
where i.id is null
order by s.item_name;
