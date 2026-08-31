<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/wordmark-dark.png">
  <img src="docs/brand/wordmark-light.png" width="320" alt="AegisFlow" />
</picture>

**AI incident response for critical procurement. The AI does the four hours of investigation — a human keeps the pen.**

*DevNetwork [API + Cloud + AI] Hackathon 2026 — SerpApi · Nutrient · Doctavian · Foxit · Xano*

[Live demo](https://aegisflow-ai.vercel.app) · [Architecture](#architecture) · [Verify the integrations](#verify-it-in-one-command)

</div>

---

## The problem

Every vendor is selling you an autonomous procurement agent. Nobody in a regulated
supply chain will let one commit spend.

When a single-source supplier of a critical component fails, a cross-functional
scramble begins. Procurement, operations, quality and legal pull fragmented facts
from contracts, certificates, supplier sites, news and internal systems, then try
to verify claims and choose an alternative — in a shared spreadsheet, under revenue
pressure. The failure modes are slow decisions, missed contradictions, and
commitments made on unverified supplier claims. One missed eight-day stockout on a
$2.4M line dwarfs any software budget.

AegisFlow makes the opposite bet from the autonomous-agent pitch. The AI runs the
whole investigation — reads the documents, searches the live web, cross-checks
every claim, scores the alternatives — and then **stops** at a human. The
consequential moves (approve, reject, sign) are reserved for a person, enforced by
a state machine rather than a prompt.

## What it does

Open `INC-1042` and press **Run Response**. A network of agents then:

| # | Stage | What happens | API |
|---|-------|--------------|-----|
| 1 | **Analyse** | Frames the disruption from the incident facts | Gemini |
| 2 | **Search** | One query per supplier + market and disruption-news queries; **zero results is a signal**, not a blank | SerpApi |
| 3 | **Extract** | Pulls the fields every claim's provenance points back to, from the six supplier PDFs | Nutrient DWS |
| 4 | **Verify** | Cross-checks every claim; surfaces the contradiction from the extracted text — not scripted | — |
| 5 | **Score** | Six transparent risk dimensions, each citing its evidence, with an **integrity gate** a weighting can't beat | — |
| 6 | **Decide** | Evidence-backed recommendation with confidence, risks and unknowns | Gemini |
| — | **Human review** | Approve / reject / request-more-evidence — the only way the workflow advances | — |
| 7 | **Generate** | The Emergency Supplier Transition Agreement, from the structured decision payload | Doctavian |
| 8 | **Watermark** | Stamps the agreement `PENDING HUMAN SIGNATURE` before anyone sees it | Nutrient DWS |
| 9 | **Sign** | eSign folder created — only after a named human-authorization guard passes | Foxit |
| — | **Record** | Normalised `incident → supplier → claim` tables + an append-only audit stream | Xano |

Every API call along the way — live, local fallback, or seeded — lands in an open
**Integration Activity Ledger** (`/integrations`) with its real request and
response. Every data path in the UI is tagged `LIVE`, `LOCAL` or `DEMO SEEDED`.
Nothing is fabricated.

### The golden scenario

`INC-1042`: Pacific Components Ltd. fails; the PX-17 Power Controller is at risk;
8 days of inventory; $2.4M exposure. Three alternatives. The cheapest —
Shenzhen Rapid Parts, at 0.85× baseline — claims *"Established 2018"*, but its
business registration shows **2021** and its ISO 9001 certificate has **no
registry match**. AegisFlow discovers the contradiction in the extracted document
text, marks the claims `CONFLICT` / `UNVERIFIED`, and refuses to treat them as
true. Recommended supplier: Nexus Manufacturing, on delivery evidence and clean
verification.

## Screenshots

| | |
|---|---|
| ![Landing](docs/screenshots/01-landing.png) **The bet** | ![Incident](docs/screenshots/02-incident.png) **The incident console** |
| ![Why](docs/screenshots/03-why.png) **Why this recommendation — re-weight the model live** | ![Integrations](docs/screenshots/04-integrations.png) **Integration Activity Ledger — every call on the record** |
| ![Evidence](docs/screenshots/05-evidence.png) **Claim-level provenance** | ![Audit](docs/screenshots/06-audit.png) **Append-only audit trail** |

Regenerate from a running instance: `node scripts/capture-screenshots.mjs`.

---

## SerpApi — Best AI Use Case

AegisFlow uses live web search for **verification, not retrieval**. The novel part
is what it does with a *miss*: a live query that returns zero organic results is a
first-class outcome, recorded in the ledger and fed to the risk model as absence
of corroboration.

- **The call:** [`serpapi/client.ts:15`](integrations/serpapi/client.ts#L15) — `GET https://serpapi.com/search`, 8s timeout, at runtime
- **Wired in:** [`web-intelligence.ts:63`](lib/agents/web-intelligence.ts#L63) — five queries per incident, run concurrently
- **Invoked by the pipeline:** [`investigation.ts`](lib/orchestration/investigation.ts) — stage 2 of every response, before any document is read
- **Proof at runtime:** `/integrations` shows all five calls with their real `organic_results`; the investigation console reads `20 live · 0 seeded`; a zero-result query is annotated *"absence of corroboration (a negative signal)"*

## Nutrient — Turn Documents Into Something People Actually Trust

Nutrient DWS is load-bearing on **both ends** of the workflow. On ingestion it
extracts the fields every claim's provenance chain points back to. On output it
watermarks the generated agreement `PENDING HUMAN SIGNATURE` before a human ever
opens it.

- **The calls:** [`nutrient/client.ts:67`](integrations/nutrient/client.ts#L67) (extract) and [`nutrient/client.ts:125`](integrations/nutrient/client.ts#L125) (watermark) — both `POST https://api.nutrient.io/build`, Processor API
- **Wired in:** [`document-intelligence.ts`](lib/agents/document-intelligence.ts) — routes the conflict-bearing documents through DWS (`NUTRIENT_FULL=true` for all six; the free tier is 50 credits)
- **Invoked by:** stage 3 of the response, and again in [`actions.ts` `prepareDocuments`](lib/orchestration/actions.ts) after approval
- **Proof at runtime:** every fact in the *Evidence* view links to the Nutrient-extracted `documentId · field` it came from; the agreement page carries a visible `PENDING HUMAN SIGNATURE` stamp

## Doctavian — Generate It Right. Sign It Tight.

The Emergency Supplier Transition Agreement is generated from a **structured,
Zod-validated decision payload** — not a free-text prompt. The
decision → payload → document chain is visible in the UI, and the payload carries
the evidence summary (verified count, conflict count, confidence) into the
contract itself.

- **The call:** [`doctavian/client.ts:9`](integrations/doctavian/client.ts#L9) — `POST https://api.doctavian.com/v1/documents/generate` with `template_id` + typed `variables`
- **Wired in:** [`actions.ts` `prepareDocuments`](lib/orchestration/actions.ts) — the payload is built by [`documents/contract.ts`](lib/documents/contract.ts) from the ranked decision
- **Proof at runtime:** the *Decision* panel shows the payload; the agreement renders from it at `/documents/agreement/[id]`; the ledger records the exact `variables` sent

## Foxit — Your Agent Shouldn't Sign That

This is the entire product thesis. The agent prepares the document *and* the
signing request — but a finite-state machine plus a named guard make it
**structurally impossible** for a non-human actor to create the eSign folder or
reach the `SIGNED` state.

- **The guard:** [`state/guards.ts:18`](lib/state/guards.ts#L18) `assertHumanMaySign(actor, state)` — throws for any non-`HUMAN` actor or wrong state
- **The state machine:** [`state/machine.ts:21`](lib/state/machine.ts#L21) `HUMAN_ONLY_TARGETS = [APPROVED, REJECTED, SIGNED]`, enforced in [`repository.ts:232`](lib/incidents/repository.ts#L232)
- **The call:** [`foxit/client.ts:52`](integrations/foxit/client.ts#L52) — `POST /esign/api/v1/folders/createfolder` with `sendNow: false`, reached only after the guard passes
- **Proof at runtime:** the test [`guards.test.ts`](tests/guards.test.ts) drives the pipeline to `SIGNATURE_REQUIRED`, then asserts `transitionIncident(id, "SIGNED", "AI")` **rejects** — the AI has no path to sign, even calling the raw transition

## Xano — Rebuild a SaaS Tool You Hate

The tool we hate: the disruption "war-room" spreadsheet every supply-chain team
maintains by hand. We rebuilt it on Xano as normalised `incident → supplier →
claim` tables plus an **append-only** `audit_event` stream. The repository pattern
means the same app runs on in-memory or Xano with one env var.

- **The client:** [`xano/client.ts`](integrations/xano/client.ts) — REST against the auto-generated CRUD group; **no custom Xano endpoints**
- **The store:** [`xano/repository.ts:34`](integrations/xano/repository.ts#L34) `XanoRepository` — assembles the domain object from four tables, writes the audit stream append-only
- **Resilience:** [`repository.ts` `ResilientRepository`](lib/incidents/repository.ts) — Xano is read once per incident then served from an in-memory mirror; writes go through a paced, coalescing background queue so the free tier's 10 req/20s limit never blocks a request or breaks a screen
- **Proof at runtime:** the sidebar footer reads `Persistence: XANO`; the four tables fill with normalised rows; `/audit` shows the append-only event stream

## Verify it in one command

No key, no account:

```bash
# every sponsor endpoint that is actually called at runtime
grep -rn "serpapi.com/search\|api.nutrient.io/build\|api.doctavian.com\|foxitesign.foxit.com\|XANO_API_BASE" integrations/

# the guard that stops the agent signing — and the test that proves it
grep -rn "assertHumanMaySign\|HUMAN_ONLY_TARGETS" lib/state/ lib/incidents/

# the integrity gate that a weighting can't beat
grep -rn "INTEGRITY_CAP\|applyIntegrityCap" lib/risk/
```

```bash
npm install && node scripts/generate-pdfs.mjs && npm run dev   # runs fully offline with zero keys
npm test                                                        # 28 passing
```

---

## Architecture

An incident enters. Three investigation agents run concurrently, a deterministic
risk engine scores the alternatives behind an integrity gate that can't be gamed,
and the recommendation stops at a human. Only a person moves it past that line —
after which the document is generated, watermarked and handed to eSign.

```mermaid
flowchart TB
    INC(["Incident INC-1042<br/>supplier down · $2.4M exposed"])

    INC --> A & W & D
    A["<b>Analyst</b><br/>Gemini"]
    W["<b>Web intelligence</b><br/>SerpApi · 5 live queries<br/>zero results = a signal"]
    D["<b>Document intelligence</b><br/>Nutrient DWS · 6 PDFs<br/>every field keeps provenance"]

    A & W & D --> V["<b>Verification</b><br/>the 'Established 2018' vs 2021<br/>contradiction, from extracted text"]
    V --> R{"<b>Risk engine</b><br/>6 cited dimensions<br/>integrity gate: a CONFLICT<br/>caps a supplier at 49/100"}
    R --> DEC["<b>Decision</b><br/>Gemini · confidence,<br/>risks, unknowns"]
    DEC --> H

    H{{"<b>HUMAN REVIEW</b><br/>approve · reject · request evidence<br/>the only way the workflow advances"}}
    H -- "request<br/>evidence" --> V
    H -- "approve<br/><b>HUMAN actor only</b>" --> GEN

    GEN["<b>Agreement</b><br/>Doctavian · from the<br/>structured decision payload"]
    GEN --> WM["<b>Watermark</b><br/>Nutrient DWS ·<br/>PENDING HUMAN SIGNATURE"]
    WM --> SIGN["<b>eSign folder</b><br/>Foxit · created only after<br/>the guard passes · sendNow:false"]
    SIGN --> DONE(["SIGNED"])

    H -. "every transition +<br/>audit event" .-> XANO[["<b>Xano</b> — system of record<br/>normalised tables · append-only audit"]]

    style INC fill:#3b82f6,stroke:#1d4ed8,color:#fff
    style H fill:#fbbf24,stroke:#d97706,color:#111
    style R fill:#fca5a5,stroke:#dc2626,color:#111
    style XANO fill:#c4b5fd,stroke:#7c3aed,color:#111
    style DONE fill:#6ee7b7,stroke:#059669,color:#111
```

### The six agents

Each returns a Zod-validated object, not a blob of prose. Gemini interprets;
it never invents a fact or a score.

| Agent | Produces | Source of truth |
|---|---|---|
| [`incident-analyst`](lib/agents/incident-analyst.ts) | One-sentence framing of the disruption | Incident facts only |
| [`web-intelligence`](lib/agents/web-intelligence.ts) | External sources + per-supplier corroboration counts | SerpApi, live |
| [`document-intelligence`](lib/agents/document-intelligence.ts) | Extracted fields → material claims, each with provenance | Nutrient DWS / local PDF text |
| [`verification`](lib/agents/verification.ts) | Verified / unverified / conflicting, per claim | Deterministic cross-check |
| [`risk/engine`](lib/risk/engine.ts) | Six scored dimensions per supplier, each citing evidence | Deterministic computation |
| [`decision`](lib/agents/decision.ts) | Recommendation narrative + risks + unknowns | Gemini, from the ranked facts |

### The integrity gate: you can't weight your way to a bad supplier

The risk model is fully transparent and the weights are live-adjustable on the
*Why this recommendation?* screen. But a supplier carrying an **unresolved
evidence conflict** is capped at `INTEGRITY_CAP = 49` regardless of weighting
([`weights.ts:35`](lib/risk/weights.ts#L35), [`engine.ts:126`](lib/risk/engine.ts#L126)).
Drag the cost weight to maximum and the conflicted cheapest supplier still loses —
its pre-gate score is shown alongside the capped one, so the gate is visible, not
hidden. A test pins this: the raw score *would* win, the gated score does not
([`risk.test.ts`](tests/risk.test.ts)).

### Human authorization is structural, not a prompt

`transitionIncident` refuses any move to `APPROVED`, `REJECTED` or `SIGNED` from a
non-`HUMAN` actor ([`repository.ts:232`](lib/incidents/repository.ts#L232)), and
`assertHumanMaySign` guards every path that could create a Foxit eSign session.
The AI orchestrator has no code path that satisfies both conditions — by
construction. The signing UI states it plainly: *"AegisFlow prepared this
agreement. Only an authorized human can sign it."*

### Every integration is a seam

| Seam | Live | Fallback (tagged) |
|---|---|---|
| Web intelligence | SerpApi | Per-query seeded corroboration · `DEMO SEEDED` |
| Document extraction | Nutrient DWS `/build` | Local PDF text extraction · `LOCAL` |
| Agreement generation | Doctavian | Local render of the same payload · `LOCAL` |
| Signing | Foxit eSign | In-app human ceremony · `LOCAL` |
| System of record | Xano | In-memory mirror · footer shows `Persistence: LOCAL` |
| Interpretation | Gemini | Deterministic fallback · labelled `Deterministic` |

The whole workflow — investigation, scoring, review, generation, signing — runs
end to end with **zero API spend and no keys**. That is how it was built, and how
you can run it now.

### Decisions worth pointing at

| | |
|---|---|
| **A live search that finds nothing is evidence** | Absence of corroboration is scored against a supplier, not silently dropped. The demo suppliers are fictional, so per-supplier corroboration comes from curated registry records while the *market/news* queries run genuinely live — each tagged for what it is. |
| **The rate-limited backend never breaks a screen** | Xano's free tier is 10 requests / 20s. Reads hydrate once then serve a mirror; writes are a paced, coalescing background queue; a transient `429` is a 20s cooldown, not a permanent downgrade. `Reset demo` pushes the fresh state back to Xano. |
| **Gemini 3.x "thinks" by default** | Which leaks reasoning text into the response and breaks strict JSON parsing. Thinking is disabled per-call, the parser tolerates fences and prose, and the agent schemas are permissive on fields the app doesn't use — [`ai/gemini.ts`](lib/ai/gemini.ts). |
| **The investigation is concurrent** | Five SerpApi queries and the document extractions run in parallel, not in series — a full response streams in ~12s instead of ~50s, well inside a serverless streaming budget. |

### Where things live

| Path | Role |
|---|---|
| `lib/orchestration/` | The investigation generator, server actions, demo controls |
| `lib/agents/` | The six agents |
| `lib/risk/` | Weights, the integrity gate, the scoring engine |
| `lib/state/` | The finite state machine and the human-authorization guard |
| `lib/incidents/` | Repository interface · in-memory · resilient Xano wrapper |
| `lib/integrations/ledger.ts` | The Integration Activity Ledger |
| `integrations/*` | One client per sponsor API, each with an honest fallback |
| `app/(workspace)/` | Dashboard · incident · evidence · why · documents · approvals · integrations · audit · business |
| `schemas/core.ts` | Every Zod schema the LLM output is validated against |

---

## Run it locally

**Prerequisites:** Node 20+. No API keys required.

```bash
git clone https://github.com/TusharTechs/aegisflow.git && cd aegisflow
npm install
node scripts/generate-pdfs.mjs      # the six evidence PDFs
cp .env.example .env.local           # optional — add sponsor keys to go LIVE
npm run dev                          # http://localhost:3000
npm test                             # 28 passing
```

With no keys the full workflow runs on honest fallbacks and every screen stays
usable. Add a key and that path switches to `LIVE` on the next run — check
`/integrations` for live status.

```bash
# All optional. See .env.example for where each key comes from.
GEMINI_API_KEY=            # aistudio.google.com/apikey
GEMINI_MODEL=gemini-flash-latest

SERPAPI_API_KEY=           # serpapi.com — free 250 searches/mo

NUTRIENT_API_KEY=          # dashboard.nutrient.io — Processor API key (free tier: 50 credits)
NUTRIENT_FULL=false        # true routes all six documents through Nutrient

DOCTAVIAN_API_KEY=         # doctavian.com
DOCTAVIAN_TEMPLATE_ID=emergency-transition-agreement

FOXIT_CLIENT_ID=           # app.developer-api.foxit.com — same creds authenticate eSign
FOXIT_CLIENT_SECRET=
FOXIT_ESIGN_HOST=https://na1.foxitesign.foxit.com

XANO_API_BASE=             # xano.com — see docs/xano-setup.md (4 tables, auto CRUD)
XANO_API_TOKEN=
XANO_AUTO_SEED=false       # true seeds INC-1042 at runtime; prefer node scripts/seed-xano.mjs

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Demo controls** (header): one-click **Reset demo**, and failure-injection toggles
that exercise the same graceful fallbacks as a real outage.

## Why this is a company

Not a feature of a procurement suite. Full case at `/business` in the app.

- **Buyer:** Head of Supply-Chain Risk / VP Operations at a manufacturer with
  single-source critical components — electronics, medical devices, aerospace.
- **Wedge:** the incident-response workflow for one commodity family — the
  spreadsheet replacement. Expands to continuous supplier monitoring and
  pre-cleared alternate-supplier playbooks.
- **Pricing:** team tier ($1.5–3k/mo + per-incident); enterprise ($60–150k/yr) with
  a private Xano backend and SSO.
- **The math the buyer runs:** one prevented eight-day stockout on a $2.4M line
  pays for the platform for years.

## What we don't claim

No autonomous procurement. No legally guaranteed contracts. No perfect
verification. No invented savings figures. Demo suppliers are fictional and
tagged; integrations are labelled `LIVE` only when the API actually responded.

## Tech

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · Zod ·
SerpApi · Nutrient DWS · Doctavian · Foxit eSign · Xano · Google Gemini · Vitest

## License

[MIT](LICENSE)
