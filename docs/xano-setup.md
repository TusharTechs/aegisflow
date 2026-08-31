# Xano setup (optional — LOCAL mode is the default)

AegisFlow talks to Xano's **default auto-generated CRUD endpoints only**. No custom
queries, no filters, no auth logic to build. ~15 minutes.

## 1. Create the four tables

In your workspace → **Database** → **Add table**. Create these with exactly these
field names (types in parentheses):

**`incident`**
`incident_key` (text) · `supplier` (text) · `affected_product` (text) · `status` (text) ·
`inventory_days` (int) · `revenue_exposure` (int) · `state` (text) · `evidence_json` (json)

**`supplier`**
`incident_id` (int) · `supplier_key` (text) · `name` (text) · `location` (text) ·
`lead_time_days` (int) · `cost_multiplier` (decimal) · `risk_score` (int) ·
`recommendation` (bool) · `recommendation_reasoning` (text)

**`claim`**
`supplier_id` (int) · `claim_key` (text) · `text` (text) · `source` (text) · `ts` (text) ·
`confidence` (int) · `status` (text) · `conflict_reason` (text) · `document_evidence` (json)

**`audit_event`**
`incident_id` (int) · `event_ts` (text) · `event` (text) · `actor` (text)

> Xano adds `id`, `created_at` automatically — leave those.

## 2. Generate CRUD endpoints

Go to **APIs** → **Add API Group** → name it `aegisflow` (or reuse the default group).
For each of the four tables, use **Add API Endpoint → CRUD → "Add all CRUD operations"**
(or the ⚡ auto-generate button). You want the standard set per table:

- `GET /{table}` (list all)
- `GET /{table}/{id}`
- `POST /{table}`
- `PATCH /{table}/{id}` (or `PUT` — either works)
- `DELETE /{table}/{id}` (not used, fine to leave)

That's it — **do not add inputs, filters, or search**. The app lists each table and
filters rows itself.

## 3. Get the base URL

On the API Group page, copy the **base URL**. It looks like:

```
https://x8ki-letl-twmt.n7.xano.io/api:AbC12dEf
```

(the `api:xxxxxx` suffix is the API group's canonical path).

## 4. Set env vars

In `.env.local` (and later as Vercel env vars):

```
XANO_API_BASE=https://x8ki-letl-twmt.n7.xano.io/api:AbC12dEf
XANO_API_TOKEN=            # leave blank — CRUD endpoints are public by default
XANO_AUTO_SEED=true        # auto-creates INC-1042 rows on first load
```

Only set `XANO_API_TOKEN` if you switched the endpoints to require authentication
(you don't need to for the demo).

## 5. Restart and verify

`npm run dev`, open the app. The left-sidebar footer should read
**Persistence: XANO**, and `/integrations` should show the Xano row as **LIVE** with
a real `PATCH/POST` call after you run an incident response. The four tables in
Xano will fill with rows; `audit_event` is append-only.

To reset: delete all rows in the four tables (or use **Reset demo** in the app header,
then reload — `XANO_AUTO_SEED` re-creates INC-1042).
