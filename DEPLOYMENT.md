# Deploying SupplyTracker PWA (+ Workers)

Everything runs on the **free tier**: two Cloudflare Pages sites (this app +
order-stock-pwa), one Cloudflare Worker (KSeF/wFirma), one shared Supabase
project. See §8 of `../supplytracker-pwa-PLAN.md` for the cost rules.

## 0. Database (once)

In the shared Supabase project's SQL editor, run in order:

1. `order-stock-pwa/supabase/schema.sql` (if not already applied)
2. `supplytracker-pwa/supabase/schema.sql`  ← this app's additive merge

Then make yourself admin:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

## 1. The PWA → Cloudflare Pages

Create a Pages project from the repo (or `wrangler pages deploy dist`).

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `supplytracker-pwa`
- Environment variables:
  - `VITE_SUPABASE_URL` = the shared project URL
  - `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_…` (safe; RLS-protected)

`public/_redirects` (SPA fallback) and `public/_headers` (don't cache the SW)
are already in place. order-stock-pwa deploys the same way, pointed at the same
two env vars — that's what makes them share the database.

## 2. The Workers → Cloudflare Workers

```bash
cd supplytracker-pwa/workers
npm install
npx wrangler deploy
# then set the secrets (see workers/README.md)
```

The service-role key lives ONLY here (a Worker Secret). Cron triggers in
`wrangler.toml` run KSeF + wFirma daily. Deferrable — the PWA is fully usable
with manual invoice entry until you deploy these.

## 3. Keep the free Supabase project awake

Reuse order-stock-pwa's `.github/workflows/keepalive.yml` so the project doesn't
pause after ~1 week idle. Two apps sharing the DB also keeps activity up.

## Checklist

- [ ] Both `schema.sql` files applied to the shared project
- [ ] Admin promoted in `profiles`
- [ ] PWA deployed with the two `VITE_` env vars
- [ ] (optional) Workers deployed with secrets + confirmed KSeF endpoints
- [ ] keepalive workflow running
