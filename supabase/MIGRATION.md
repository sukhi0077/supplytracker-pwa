# Phase 5 — Migrating existing SupplyTracker data (only if needed)

Skip this entirely if SupplyTracker has **no live data** (green-field). Then the
shared tables just fill up as you use the PWA and order-stock-pwa.

If the old Django/Postgres SupplyTracker **does** hold real data, this is a
**one-time ETL** into the shared Supabase database. The two schemas already line
up (that was the point of `schema.sql`), so it's a data copy, not a rewrite.

## The one rule that makes it safe

Both systems key the same real-world things the same way, so import in this order
and match on these keys — never on the old integer IDs:

| Entity | Match / dedupe key | Notes |
|---|---|---|
| Category | `name` | unique in both |
| SubCategory | `(category, name)` | |
| Unit | `code` | `units.code` |
| **Supplier** | `nip` first, else `name` | order-stock rows may already exist |
| **Item** | `code` (`ITM-####`) first, else `name` | the cross-app join key |
| Invoice | `(supplier_id, number)` | |
| InvoiceLine | `(invoice, line_no)` | |
| InvoiceDetail | new rows | link to invoice/line by the above |
| StockMovement | new rows | let the trigger rebuild `stock_levels` |
| SalesRecord | `(month, category, item_name)` | idempotent upsert |

Because order-stock-pwa seeded items from the **same sheet**, most items already
exist in `items` with the same `ITM-####` code — so you UPDATE those with
SupplyTracker's richer fields rather than inserting duplicates.

## Recommended approach: a Django management command

The cleanest path reuses the Django ORM you already have to read, and the
Supabase service-role key to write (bypasses RLS). Sketch:

```python
# supplytracker/backend/core/management/commands/export_to_supabase.py
import os
from supabase import create_client          # pip install supabase
from core.models import Category, SubCategory, UnitOfMeasure, Supplier, Item, \
    Invoice, InvoiceLine, InvoiceDetail, StockMovement, SalesRecord

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

# 1) master data — upsert on natural keys
for c in Category.objects.all():
    sb.table("categories").upsert({"name": c.name}, on_conflict="name").execute()
# … sub_categories (resolve category_id), units (on_conflict=code) …

# 2) suppliers — upsert on name (nip carried for reconciliation)
for s in Supplier.objects.all():
    sb.table("suppliers").upsert({
        "name": s.name, "nip": s.nip, "ksef_name": s.ksef_name,
        "email": s.email, "phone": s.phone, "address": s.address,
        "payment_terms_days": s.payment_terms_days, "iban": s.iban,
        "delivery_days": s.delivery_days, "active": s.is_active,
    }, on_conflict="name").execute()

# 3) items — upsert on code (the ITM-#### join key). Resolve unit_id/
#    sub_category_id/primary_supplier_id by looking up the ids you just wrote.
# 4) invoices -> invoice_lines -> invoice_details, resolving FKs by natural key.
# 5) stock_movements last — the DB trigger rebuilds stock_levels from them,
#    so you do NOT import stock_levels directly.
```

Run it once with the service-role key in the environment. Re-running is safe
because every step upserts on a natural key.

## Alternative: SQL/CSV

`pg_dump --data-only --table=core_item …` from the old DB, load into staging
tables in Supabase, then `insert … select` into the real tables mapping
`bigint` ids to the new `uuid`s via the natural-key joins above. More manual FK
bookkeeping than the ORM approach.

## After import — verify

```sql
select
  (select count(*) from items)          as items,
  (select count(*) from suppliers)      as suppliers,
  (select count(*) from invoices)       as invoices,
  (select count(*) from invoice_lines)  as invoice_lines,
  (select count(*) from stock_levels)   as stock_levels;
```

Spot-check a few `ITM-####` items in the PWA, confirm supplier NIPs matched (no
duplicate suppliers), and confirm stock levels look right (they're derived from
the movements you imported, via the trigger).
