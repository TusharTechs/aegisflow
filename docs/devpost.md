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
3b. **Domain footprint** (name.com) asks whether each supplier owns the domain it would
   trade under. A company trading since 2018 registered its domain; a purchasable one
   is scored as absence of commercial footprint.
4. **Verification** runs named rules over the extracted fields. `entity-age-vs-registry`
   compares the founding year a supplier claims publicly against the `FORMED` date on
   its registration; `certificate-registry-match` checks a certificate against its
   registry match, its issuer's accreditation, and its expiry. No verdict is keyed on a
   document id — edit the PDF and the verdict changes.
5. **Risk engine** scores each alternative on six transparent dimensions, each citing
   its evidence. Judges can re-weight the model live on the "Why this recommendation?"
   screen — and even maxing the cost weight cannot make a conflicted supplier win.
6. **Decision** produces an evidence-backed recommendation with confidence, risks,
   and unknowns.

Then it stops. Approve / reject / request-more-evidence are human-only transitions,
enforced in the state machine (`HUMAN_ONLY_TARGETS`), not by prompt. On approval:
Doctavian generates the Emergency Supplier Transition Agreement from the structured
decision payload, Nutrient stamps it **PENDING HUMAN SIGNATURE**, and Foxit creates
the eSign session — only after two independent gates pass: the named `assertHumanMaySign`
guard, and a tool registry that classifies eSign as the one IRREVERSIBLE operation.

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
  six real sponsor integrations each with an honest fallback, 61 passing tests,
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

We use Doctavian's actual document-request model rather than treating it as string
interpolation: the decision payload is uploaded as the data source
(`POST /v1/documents/data/upload`), then rendered against the stored template
(`POST /v1/documents/document/generate`), then fetched by document URN. Both
credentials the gateway requires are wired — the `X-Api-Key` subscription key and the
Microsoft OAuth2 bearer.

### Foxit — Your Agent Shouldn't Sign That
This is the whole product thesis, and Foxit drew the line first: their MCP server
exposes ~40 **reversible** PDF operations as agent tools, and signing is deliberately
excluded — to put a document in front of a signer you have to leave the tool sandbox
and call eSign directly. We turned that API-design opinion into an enforced property
of the application.

`lib/state/agent-tools.ts` registers every document operation with a risk class
(REVERSIBLE / IRREVERSIBLE) and the actors permitted to invoke it. `esign.createFolder`
is the only irreversible entry: HUMAN-only, valid from exactly one state.
`tests/agent-tools.test.ts` enumerates every actor × every workflow state and asserts
that no non-human combination can reach it. A finite-state machine and the named
`assertHumanMaySign(actor, state)` guard hold the same line independently.

The eSign integration authenticates the way Foxit documents it — OAuth2
`client_credentials` against `/api/oauth2/access_token`, exchanged for a bearer — and
creates the signing folder via `POST /api/folders/createfolder` with `sendNow: false`.
Worth noting for anyone reproducing this: eSign credentials are isolated from the PDF
Services pair by design. We verified it — sending the developer-api.foxit.com
credentials to the eSign token endpoint returns `invalid_client`.

### name.com — Domain API Challenge
A manufacturer that has traded for eight years has a website, and a website means
somebody registered the domain. So "is this supplier's domain still available to buy?"
is really "does this supplier exist commercially?" — and one `checkAvailability` call
answers it.

That makes name.com the **third independent line of evidence** on the same
contradiction: the business registration says 2021, the ISO certificate has no registry
match, and `shenzhenrapidparts.com` is unregistered. A supplier can forge a PDF; getting
all three to agree is much harder. A purchasable domain feeds the risk model as a
negative signal, exactly as a zero-result SerpApi query does — absence is evidence.

With no credentials set, the app reports the registration states observed against public
DNS and tags them `DEMO SEEDED`. It reports what is true rather than inventing a better
story.

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
SerpApi, Nutrient DWS, Doctavian, Foxit eSign, name.com Core API, Xano, Google Gemini, Vitest.

## Try it out

- Live: _(add Vercel URL after deploy — see README "Deploy")_
- Repo: _(add repo URL)_
- Runs with zero API keys: `npm install && node scripts/generate-pdfs.mjs && npm run dev`

## Demo script (2–3 min)

1. **Cold open on the conflict.** `/incidents/INC-1042` → "Run Response". While it
   streams, say the one line: *"A supplier just failed. The AI is doing the four
   hours of investigation right now."*
2. **The money shot.** Land on the red **Evidence conflict** panel — four independent
   findings against the cheapest supplier: "Established 2018" vs registration 2021,
   an ISO cert with no registry match, near-zero web corroboration, and a company
   domain that is still available to buy. Each card names the rule that produced it.
   *"Four different systems disagree with this supplier. It will not be treated as
   verified."*
3. **Prove it isn't scripted.** `lib/agents/document-rules.ts` — no rule mentions a
   filename. Change `FORMED` in the registration PDF to 2018 and re-run: the conflict
   is gone. *"The engine detects the contradiction. It doesn't replay one."*
4. **Stress-test.** "Why this recommendation?" → drag the **Cost** weight to max.
   The conflicted supplier still loses. *"The model is transparent and you can't
   game it into a bad call."*
5. **The handoff.** Approve → the agreement generates (Doctavian), gets stamped
   PENDING HUMAN SIGNATURE (Nutrient), and the signing panel says: *"AegisFlow
   prepared this. Only an authorized human can sign it."* Sign as a human.
6. **Proof.** `/integrations` → every sponsor API call with its real request and
   response. `/audit` → the append-only trail. `/business` → why it's a company.
