-- ============================================================================
-- FULL KSeF mappings import — carries PACK SIZE + SUPPLIER from the live old DB.
--
-- The repo CSV (old_ksef_mappings.csv) only has item_name + ksef_item_name, so
-- pack sizes aren't in it. Export the LIVE mappings from the old Postgres with
-- pack_size and supplier, then use this to load them into Supabase.
--
-- STEP A — export from the old Postgres (run where that DB is reachable):
--   psql "$DATABASE_URL" -c "\copy ( \
--     select m.ksef_item_name, it.name as item_name, it.code as item_code, \
--            s.name as supplier_name, s.nip as supplier_nip, m.pack_size \
--     from core_ksefmapping m \
--     join core_item it     on it.id = m.item_id \
--     left join core_supplier s on s.id = m.supplier_id \
--   ) to 'ksef_mappings_live.csv' with csv header"
--
-- STEP B — create the staging table (run PART 1 below once).
-- STEP C — in the Supabase Table Editor, open public.ksef_import_staging ->
--          Insert -> Import data from CSV -> upload ksef_mappings_live.csv
--          (headers map by name, so column order doesn't matter).
-- STEP D — run PART 2 below to resolve keys and upsert (idempotent; also
--          refreshes pack_size on mappings that already exist).
-- ============================================================================

-- ---------- PART 1: staging table ----------
create table if not exists public.ksef_import_staging (
  ksef_item_name text,
  item_name      text,
  item_code      text,
  supplier_name  text,
  supplier_nip   text,
  pack_size      numeric
);
truncate public.ksef_import_staging;   -- then upload the CSV into it (STEP C)

-- ---------- PART 2: resolve + upsert (run AFTER the CSV is uploaded) ----------
with resolved as (
  select
    btrim(s.ksef_item_name) as ksef_item_name,
    coalesce(
      (select i.id from public.items i where s.item_code is not null and i.code = btrim(s.item_code) limit 1),
      (select i.id from public.items i where lower(i.name) = lower(btrim(s.item_name)) limit 1)
    ) as item_id,
    (select sup.id from public.suppliers sup
       where (nullif(btrim(s.supplier_nip), '') is not null and sup.nip = btrim(s.supplier_nip))
          or (nullif(btrim(s.supplier_name), '') is not null and lower(sup.name) = lower(btrim(s.supplier_name)))
       limit 1) as supplier_id,
    coalesce(nullif(s.pack_size, 0), 1) as pack_size
  from public.ksef_import_staging s
  where nullif(btrim(s.ksef_item_name), '') is not null
)
-- Insert mappings that don't exist yet (matched to an item).
insert into public.ksef_mappings (ksef_item_name, item_id, supplier_id, pack_size)
select r.ksef_item_name, r.item_id, r.supplier_id, r.pack_size
from resolved r
where r.item_id is not null
  and not exists (
    select 1 from public.ksef_mappings k
    where k.ksef_item_name = r.ksef_item_name
      and coalesce(k.supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(r.supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Refresh pack_size (and item/supplier) on mappings that already existed.
update public.ksef_mappings k
set pack_size = r.pack_size,
    item_id   = coalesce(r.item_id, k.item_id),
    updated_at = now()
from (
  select
    btrim(s.ksef_item_name) as ksef_item_name,
    coalesce(
      (select i.id from public.items i where s.item_code is not null and i.code = btrim(s.item_code) limit 1),
      (select i.id from public.items i where lower(i.name) = lower(btrim(s.item_name)) limit 1)
    ) as item_id,
    (select sup.id from public.suppliers sup
       where (nullif(btrim(s.supplier_nip), '') is not null and sup.nip = btrim(s.supplier_nip))
          or (nullif(btrim(s.supplier_name), '') is not null and lower(sup.name) = lower(btrim(s.supplier_name)))
       limit 1) as supplier_id,
    coalesce(nullif(s.pack_size, 0), 1) as pack_size
  from public.ksef_import_staging s
  where nullif(btrim(s.ksef_item_name), '') is not null
) r
where k.ksef_item_name = r.ksef_item_name
  and coalesce(k.supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)
    = coalesce(r.supplier_id, '00000000-0000-0000-0000-000000000000'::uuid);

-- ---------- diagnostics ----------
select
  (select count(*) from public.ksef_import_staging)                                          as staged_rows,
  (select count(*) from public.ksef_import_staging s
     join public.items i on lower(i.name)=lower(btrim(s.item_name))
        or (s.item_code is not null and i.code=btrim(s.item_code)))                            as matched_to_item,
  (select count(*) from public.ksef_mappings)                                                 as total_mappings_now,
  (select count(*) from public.ksef_mappings where pack_size <> 1)                             as mappings_with_pack;

-- Staged rows whose item didn't match (fix the name/code, re-upload, re-run PART 2):
select distinct s.item_name, s.item_code
from public.ksef_import_staging s
left join public.items i
  on lower(i.name)=lower(btrim(s.item_name)) or (s.item_code is not null and i.code=btrim(s.item_code))
where i.id is null
order by s.item_name;
