# SupplyTracker Workers — KSeF + wFirma

Cloudflare Worker that runs SupplyTracker's two server-side integrations against
the **shared Supabase database**. It's the Phase 4 piece of the plan — the PWA
handles all UI; this handles the parts that can't live in a browser.

- **KSeF fetch** — authenticates to the KSeF 2.0 API (RSA-OAEP via Web Crypto),
  queries purchase invoices in a date range, parses the FA XML
  (`fast-xml-parser`), and upserts `invoices` + `invoice_lines`. Optionally
  writes `purchase_in` stock movements. Logs each run to `ksef_fetch_jobs`.
- **wFirma sync** — pulls expense documents and mirrors payment status onto
  matching `invoices` (`wfirma_*` columns).

It writes with the Supabase **service-role key** (bypasses RLS — correct for a
trusted backend job). That key, and the KSeF/wFirma credentials, live only as
Worker Secrets.

## Why Workers (and staying free)

The KSeF job is I/O-bound and chunked (one invoice per iteration), so it fits the
**free** Workers limits: waiting on `fetch()` doesn't count toward the 10ms CPU
budget, and 100k requests/day is far more than needed. Cron Triggers run it
daily. See §4 and §8 of `../../supplytracker-pwa-PLAN.md`.

## Setup

```bash
npm install
npx wrangler login

# Secrets (never committed):
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put KSEF_NIP
wrangler secret put KSEF_TOKEN
wrangler secret put KSEF_PUBLIC_KEY_PEM      # KSeF public key, SPKI PEM
wrangler secret put WFIRMA_LOGIN
wrangler secret put WFIRMA_PASSWORD
wrangler secret put TRIGGER_SECRET           # guards the manual HTTP endpoint

npm run typecheck
npx wrangler deploy
```

Non-secret config (`KSEF_BASE_URL`, `KSEF_ENV`, `KSEF_WRITE_STOCK`, cron) is in
`wrangler.toml`. Switch `KSEF_BASE_URL` to the prod host when ready.

## Triggering

- **Cron:** `20 6 * * *` runs KSeF (last 4 days), `40 6 * * *` runs wFirma
  (last ~40 days).
- **Manual:** from an admin action or curl —

  ```bash
  curl -X POST "https://<worker>/run/ksef?from=2026-07-01&to=2026-07-18" \
    -H "x-trigger-secret: <TRIGGER_SECRET>"
  curl -X POST "https://<worker>/run/wfirma" -H "x-trigger-secret: <TRIGGER_SECRET>"
  ```

## Before production — confirm the KSeF endpoints

KSeF changes endpoint paths and the FA schema URL between releases. The auth
crypto and control flow here are complete and typecheck clean, but verify these
against the current KSeF 2.0 OpenAPI for your environment:

- `/auth/challenge`, `/auth/ksef-token`, `/auth/{ref}`, `/auth/token/redeem`
- `/invoices/query`, `/invoices/{ref}`
- the FA namespace/tag names in `src/ksef/parser.ts` (P_1, P_2, P_7, P_8A/B,
  P_9A/B, P_11, P_11A, P_12, P_15, FaWiersz, Podmiot1…)

The Python source in `../../SupplyTracker/backend/core/ksef/` is the reference.
