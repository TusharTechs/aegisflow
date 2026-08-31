# AegisFlow — Devpost submission

## Name

AegisFlow

## Elevator pitch

Everyone is selling you an autonomous agent. AegisFlow makes the opposite bet: when
a critical supplier fails, the AI does the four hours of investigation — then stops.
A human keeps the pen.

## The problem (real, and expensive)

When a single-source supplier of a critical component goes down, a cross-functional
scramble begins. Procurement, operations, quality, and legal pull fragmented facts
from contracts, certificates, supplier sites, news, and internal systems, then try
to verify claims and choose an alternative — in a shared spreadsheet, under revenue
pressure. The failure modes: slow decisions, missed contradictions, and commitments
made on unverified supplier claims. One missed 8-day stockout on a $2.4M line dwarfs
any software budget.

## What we built

A working incident-response workspace. One click runs a live investigation:

1. **Analyst** frames the disruption.
2. **Web intelligence** (SerpApi) runs one query per supplier plus market/news queries.
   Zero corroboration is recorded as a *negative* signal, not ignored.
3. **Document intelligence** (Nutrient) extracts text and fields from six supplier PDFs.
4. **Verification** cross-checks every claim; contradictions are surfaced from the
   extracted text — not scripted.
5. **Risk engine** scores each alternative on six transparent dimensions, each citing
   its evidence. Judges can re-weight the model live on the "Why this recommendation?"
   screen — and even maxing the cost weight cannot make a conflicted supplier win.
6. **Decision** produces an evidence-backed recommendation with confidence, risks,
   and unknowns.

Then it stops. Approve / reject / request-more-evidence are human-only transitions,
enforced in the state machine (`HUMAN_ONLY_TARGETS`), not by prompt. On approval:
Doctavian generates the Emergency Supplier Transition Agreement from the structured
decision payload, Nutrient stamps it **PENDING HUMAN SIGNATURE**, and Foxit creates
the eSign session — only after a named `assertHumanMaySign` guard passes.

Every sponsor API call — live, local fallback, or seeded — is recorded in an open
**Integration Activity Ledger** (`/integrations`) with its real request and response.
Nothing is faked: every data path is tagged `LIVE`, `LOCAL`, or `DEMO SEEDED`.

## The golden scenario

`INC-1042`: Pacific Components Ltd. fails; PX-17 Power Controller at risk; 8 days of
inventory; $2.4M exposure. Three alternatives. The cheapest, Shenzhen Rapid Parts
(0.85× baseline), claims "Established 2018" — but its business registration shows
2021 and its ISO 9001 certificate has no registry match. AegisFlow discovers the
contradiction in the extracted document text, marks the claims `CONFLICT` /
`UNVERIFIED`, and refuses to treat them as verified. Recommended supplier: Nexus
Manufacturing, on delivery evidence and clean verification.

## How the judging criteria are met

- **Progress:** end-to-end working app — six agents, SSE-streamed investigation,
  transparent risk engine with live re-weighting, human-in-the-loop state machine,
  five real sponsor integrations each with an honest fallback, 27 passing tests,
  `next build` green.
- **Concept:** a real, board-level problem (supply-chain disruption response) with a
  sharp wedge — the analyst who lives in the disruption "war-room" spreadsheet.
- **Feasibility:** procurement/ops SaaS; Team and Enterprise tiers; the cost of one
  missed disruption dwarfs the subscription. Full business case at `/business`.

## Per-challenge write-ups

### SerpApi — Best AI Use Case
AegisFlow uses live web search for **verification**, not retrieval. It runs one query
per candidate supplier (registry, certification) plus market and disruption-news
queries. A live call that returns **zero** organic results is a first-class outcome —
recorded in the ledger and fed into the risk model as absence of corroboration. This
is the novel bit: the AI treats what it *cannot* find as evidence.

### Nutrient — Turn Documents Into Something People Actually Trust
Nutrient DWS is load-bearing on **both ends**. On ingestion, `extract-text` pulls the
fields that every claim's provenance points back to (document + field + mode). On
output, the `build` pipeline stamps the generated agreement **PENDING HUMAN
SIGNATURE** before any human sees it. "Trust" here is literal: every fact in the UI
links to the Nutrient-extracted field it came from.

### Doctavian — Generate It Right. Sign It Tight.
The Emergency Supplier Transition Agreement is generated from a **structured,
Zod-validated decision payload** — not a free-text prompt. The decision → payload →
document chain is visible in the UI, and the payload carries the evidence summary
(verified count, conflict count, confidence) into the contract itself.

### Foxit — Your Agent Shouldn't Sign That
This is the whole product thesis. The agent prepares the document *and* the signing
request, but a finite-state machine plus a named `assertHumanMaySign(actor, state)`
guard make it structurally impossible for a non-human actor to create the Foxit
eSign folder or reach the `SIGNED` state. We wrote the tests that prove the AI is
blocked even when it calls the raw transition directly. The eSign integration
authenticates with the unified Foxit `client_id` / `client_secret` and creates the
signing folder via `POST /esign/api/v1/folders/createfolder` with `sendNow: false` —
prepared under the human's authorization, never auto-sent by the agent.

### Xano — Rebuild a SaaS Tool You Hate
The tool we hate: the disruption "war-room" spreadsheet every supply-chain team
maintains by hand. We rebuilt it on Xano as normalized `incident → supplier → claim`
tables plus an **append-only** `audit_event` stream. The repository pattern means
the same app runs on in-memory or Xano with one env var; the footer shows which.

## What we do not claim

No autonomous procurement. No legally guaranteed contracts. No perfect verification.
No invented savings figures. Demo suppliers are fictional and tagged. Market figures
in `/business` are order-of-magnitude framing, not audited data.

## Built with

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, Zod,
SerpApi, Nutrient DWS, Doctavian, Foxit eSign, Xano, Google Gemini, Vitest.

## Try it out

- Live: _(add Vercel URL after deploy — see README "Deploy")_
- Repo: _(add repo URL)_
- Runs with zero API keys: `npm install && node scripts/generate-pdfs.mjs && npm run dev`

## Demo script (2–3 min)

1. **Cold open on the conflict.** `/incidents/INC-1042` → "Run Response". While it
   streams, say the one line: *"A supplier just failed. The AI is doing the four
   hours of investigation right now."*
2. **The money shot.** Land on the red **Evidence conflict** panel: cheapest supplier,
   "Established 2018" vs registration 2021, ISO cert with no registry match, zero
   independent corroboration. *"AegisFlow found this in the document text. It will
   not treat the claim as true."*
3. **Stress-test.** "Why this recommendation?" → drag the **Cost** weight to max.
   The conflicted supplier still loses. *"The model is transparent and you can't
   game it into a bad call."*
4. **The handoff.** Approve → the agreement generates (Doctavian), gets stamped
   PENDING HUMAN SIGNATURE (Nutrient), and the signing panel says: *"AegisFlow
   prepared this. Only an authorized human can sign it."* Sign as a human.
5. **Proof.** `/integrations` → every sponsor API call with its real request and
   response. `/audit` → the append-only trail. `/business` → why it's a company.
