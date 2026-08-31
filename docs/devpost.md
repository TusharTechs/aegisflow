# AegisFlow — AI incident response for critical procurement

**Your supplier failed. Your response shouldn't.**

## Problem

Critical supplier disruptions force procurement teams into hours of fragmented manual
investigation: contracts, certificates, supplier websites, news, market data, and
internal records — cross-checked in spreadsheets, under time pressure, with revenue
on the line. The failure modes are slow decisions, missed contradictions, and
decisions made on unverified supplier claims.

## Solution

AegisFlow compresses the investigate → verify → compare → recommend → approve →
sign workflow into minutes. One click runs a live investigation: documents are
processed, claims are extracted, the web is searched, evidence is cross-checked,
alternatives are scored by a transparent risk model, and an evidence-backed
recommendation — with confidence, risks, and unknowns — is prepared for human approval.
On approval, the emergency transition agreement is generated and handed to an
authorized human for signature.

## Innovation

1. **Evidence-backed AI, not opaque AI.** Every claim has provenance: document +
   field, source URL, timestamp, confidence, verification status. The "Why this
   recommendation?" screen shows every dimension's score with its cited evidence and
   lets judges re-weight the model live.
2. **Intelligent uncertainty.** When Shenzhen Rapid Parts claims ISO 9001 but no
   independent verification exists, AegisFlow says `UNVERIFIED` and explains why.
   When a supplier's "Established 2018" contradicts its 2021 registration, the
   conflict is surfaced — discovered from extracted document text, not scripted.
3. **Human authorization as architecture.** A finite state machine makes it impossible
   for the AI to approve or sign. Signing shows: "AegisFlow prepared this agreement.
   Only an authorized human can sign it."
4. **Honest live/demo duality.** Every data path is tagged LIVE / LOCAL / DEMO SEEDED.
   Failure-injection controls prove the workflow survives any sponsor API outage.

## Technical implementation

- **Next.js 16 (App Router), TypeScript, Tailwind, Zod.** Server Components for data;
  Server Actions for state transitions; SSE `ReadableStream` for the live timeline.
- **Agents** (analyst, web, documents, verification, evaluation, decision) return
  Zod-validated structured output. Gemini is used for interpretation only; facts and
  scores come from documents, searches, and deterministic computation.
- **SerpApi**: five real queries per incident (market, news, per-supplier
  corroboration); low corroboration counts are shown as-is.
- **Nutrient**: PDF text extraction; the claim extractor parses extracted fields.
  Six real PDFs ship in the repo.
- **Doctavian**: agreement generated from the structured decision payload
  (decision → payload → document, visible in the UI).
- **Foxit**: eSign session at the signature boundary; in-app ceremony as fallback.
- **Xano**: normalized incident → supplier → claim tables plus append-only audit
  events; repository pattern allows swapping backends without touching the app.
- **Tests**: Vitest suite covering extraction, conflict detection, scoring,
  recommendation logic, the approval state machine, fallbacks, contract payload,
  and audit events.

## Human control

AI prepares; humans authorize irreversible actions. Approve / request-more-evidence /
reject are human-only transitions; the agreement signature requires an explicit
authorization checkbox and is recorded in the immutable audit trail.

## Business

Procurement/operations SaaS for manufacturers, electronics companies, and logistics
providers with single-source critical components: platform subscription +
per-incident usage, enterprise tier with private backends. Credible wedge: the cost
of one missed disruption dwarfs the subscription.

## What we don't claim

No autonomous procurement, no legally guaranteed contracts, no perfect verification,
no invented savings figures. Demo suppliers are fictional and clearly tagged;
live integrations are labeled LIVE only when the API actually responded.

---

> **AegisFlow doesn't replace the people responsible for the decision.
> It replaces the hours they spend finding the answer.**