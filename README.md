# AegisFlow

**AI incident response for critical procurement.**

When a critical supplier fails, AegisFlow investigates, verifies, and prepares the
response — while humans remain in control of irreversible decisions.

> **AI prepares. Humans authorize.**

## The problem

When a critical supplier experiences a disruption, procurement and operations teams
must rapidly gather fragmented information from contracts, certificates, supplier
websites, news, market data, and internal systems — then verify claims, compare
alternatives, assess risk, calculate business impact, prepare legal documents, and
obtain approval. This process is slow, fragmented, and error-prone.

AegisFlow compresses the investigation and decision-preparation workflow into minutes.

## What we are NOT

- Not autonomous procurement. The AI cannot approve, cannot sign, and cannot advance
  the workflow past human review. A strict finite state machine enforces this.
- Not an opaque "AI says so" tool. Every claim carries provenance (document, field,
  source URL, timestamp, confidence, verification status). Every recommendation
  ships with confidence, risks, and unknowns.

## The golden scenario

`INC-1042`: Pacific Components Ltd. disruption affects the PX-17 Power Controller.
8 days of inventory, $2.4M revenue exposure. Three candidate suppliers — including
one (Shenzhen Rapid Parts) that is cheapest but carries an evidence conflict
(claims "Established 2018"; registration shows 2021; ISO certificate has no registry
match). AegisFlow discovers the conflict from extracted document text and refuses to
treat the claim as verified.

## Architecture

```
 Next.js App Router (Server Components + Server Actions + SSE streaming)
 │
 ├─ Incident Page ──▶ /api/incidents/[id]/investigate  (streams agent execution)
 │
 ├─ Orchestration (lib/orchestration)
 │    agents: incident-analyst · web-intelligence · document-intelligence ·
 │            verification · evaluation(risk engine) · decision
 │    All LLM output is Zod-validated. The LLM interprets; it never invents facts.
 │
 ├─ State machine (lib/state) — human-in-the-loop enforcement
 │
 ├─ Repository interface (lib/incidents)
 │    ├─ InMemoryRepository  (LOCAL demo mode)
 │    └─ XanoRepository      (real backend, auto-seeds demo data)
 │
 └─ integrations/ (each with honest, tagged fallback)
      serpapi · nutrient · doctavian · foxit · xano · gemini
```

### Sponsor integrations — why each is genuinely needed

| Integration | Role in the workflow | Without key |
|---|---|---|
| **SerpApi** | Live web intelligence: market context, disruption news, supplier corroboration. Absence of evidence is treated as evidence. | Per-query seeded sources, tagged `DEMO SEEDED` |
| **Nutrient** | PDF text extraction; claims are derived from extracted document fields. | Local extraction over the same PDFs, tagged `LOCAL` |
| **Doctavian** | Generates the Emergency Supplier Transition Agreement from the structured decision payload. | Local render of the same payload, tagged `LOCAL RENDER` |
| **Foxit** | eSign session creation at the signing boundary. | In-app human ceremony; the human is always the source of authorization |
| **Xano** | System of record: normalized incident→supplier→claim tables + append-only audit events. | In-memory store, footer shows `Persistence: LOCAL` |
| **Gemini** | Interpretation only (analyst summary, decision reasoning), Zod-validated. | Deterministic fallback, labeled as such |

Nothing is ever faked: every data path is tagged `LIVE`, `LOCAL`, or `DEMO SEEDED` in the UI.

## Risk model

Transparent and configurable (live-adjustable on the **Why this recommendation?** screen):

```
25% Compliance · 20% Delivery · 20% Evidence confidence
15% Supplier reliability · 10% Cost · 10% Product compatibility
```

Every dimension cites its evidence. Even maxing the Cost weight cannot make the
conflicted supplier win.

## Setup

```bash
npm install
node scripts/generate-pdfs.mjs   # generates the 6 evidence PDFs
cp .env.example .env.local       # add any sponsor keys (all optional)
npm run dev
npm test                         # vitest suite
```

Demo controls (header): one-click **Reset demo** and **failure injection** toggles
that exercise the same graceful fallbacks as real outages.

## Definition of done (verified)

✓ Incident created ✓ Disruption understood ✓ Documents processed ✓ Claims extracted
✓ Live web research ✓ External evidence collected ✓ Claims verified ✓ Contradiction
detected ✓ Alternatives evaluated ✓ Risk calculated ✓ Recommendation produced
✓ Recommendation explained ✓ Human approval ✓ Agreement generated ✓ Signing handoff
✓ Audit trail recorded

## Business model

Procurement/operations SaaS: platform subscription + per-incident usage;
enterprise tier with private backends (Xano) and SSO. Buyers: manufacturing,
electronics, logistics, and any operation with single-source critical components.

## What we do not claim

No fully autonomous procurement. No legally guaranteed contracts. No perfect
verification. No real-world savings figures. Fictional demo suppliers are clearly
seeded and tagged.