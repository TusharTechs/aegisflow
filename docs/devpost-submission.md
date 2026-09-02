# Devpost submission — copy-paste ready

---

## Project name

```
AegisFlow
```

## Elevator pitch  *(200 char limit — this is 171)*

```
Everyone is selling you an autonomous procurement agent. AegisFlow makes the opposite bet: the AI does the four hours of investigation, then stops. A human keeps the pen.
```

## Try it out links

```
https://aegisflow-ai.vercel.app
https://github.com/TusharTechs/aegisflow
```

## Sponsor / Special Prizes — tick these six

- Foxit Software — Your Agent Shouldn't Sign That
- Doctavian — Generate It Right. Sign It Tight.
- name.com — Domain API Challenge
- Nutrient — Turn Documents Into Something People Actually Trust
- SerpApi — Best AI Use Case
- Xano — Rebuild a SaaS Tool You Hate

*(Not Perfect Corp — no honest fit.)*

## Built with  *(tags)*

```
next.js  react  typescript  tailwindcss  zod  vitest  node.js  vercel
serpapi  nutrient-dws  doctavian  foxit-esign  name.com  xano  google-gemini
playwright  server-sent-events  finite-state-machine
```

---

## Image gallery — captions *(140 char limit each)*

**01-landing.png**
```
The bet, stated up front: the AI does the whole investigation, then stops at a human. Approve and sign are never the agent's to take.
```

**03-conflict.png** *(lead with this one)*
```
Four independent systems disagree with the cheapest supplier — registration, certificate, web, domain. Each verdict names its rule.
```

**04-why.png**
```
Cost weight at 36%. The conflicted supplier still caps at 49/100 — an integrity gate means you cannot weight your way to a bad call.
```

**02-incident.png**
```
INC-1042: supplier down, 8 days of inventory, $2.4M exposed. Six agents run live sponsor APIs and stream findings into one case file.
```

**05-integrations.png**
```
Every sponsor API call on the record with its real request and response, tagged LIVE, LOCAL or DEMO SEEDED. Nothing here is fabricated.
```

**06-evidence.png**
```
Claim-level provenance: every fact links back to the extracted document and field it came from, and the rule that judged it.
```

**07-audit.png**
```
Append-only audit trail in Xano. Every transition carries its actor — SYSTEM, AI or HUMAN — and the human-only moves are enforced.
```

**08-business.png**
```
Why it is a company, not a feature: the buyer, the wedge, the pricing, and the arithmetic a Head of Supply-Chain Risk actually runs.
```

---

## About the project

### The problem

When a single-source supplier of a critical component fails, a cross-functional
scramble begins. Procurement, operations, quality and legal pull fragmented facts
out of contracts, certificates, supplier websites, news and internal systems, try to
verify what the supplier claims, and pick an alternative — in a shared spreadsheet,
under revenue pressure. The failure modes are slow decisions, missed contradictions,
and commitments made on unverified claims. One missed eight-day stockout on a $2.4M
line dwarfs any software budget.

### The bet

Every vendor is selling an autonomous procurement agent. Nobody in a regulated
supply chain will let one commit spend.

AegisFlow makes the opposite bet. The AI runs the entire investigation — reads the
documents, searches the live web, checks whether each supplier owns the domain it
trades under, cross-checks every claim, scores the alternatives — and then **stops**.
Approve, reject and sign are reserved for a human, enforced by a finite state machine
and a named guard, not by a prompt.

### What it does

Open `INC-1042` and press **Run Response**:

1. **Analyst** frames the disruption (Gemini).
2. **Web intelligence** runs five live SerpApi queries. A query returning *zero*
   results is a first-class outcome, scored as absence of corroboration.
3. **Domain footprint** asks name.com whether each supplier's domain is still
   purchasable. A manufacturer trading since 2018 registered its domain; one whose
   domain is still for sale has no commercial footprint.
4. **Document intelligence** extracts fields from six supplier PDFs via Nutrient DWS.
5. **Verification** runs named rules over those fields.
6. **Risk engine** scores six transparent dimensions, each citing its evidence.
7. **Decision** produces a recommendation with confidence, risks and unknowns.

Then it stops. On human approval: Doctavian generates the Emergency Supplier
Transition Agreement from the structured decision payload, Nutrient stamps it
**PENDING HUMAN SIGNATURE**, and Foxit creates the eSign folder — only after a named
guard passes.

### The golden scenario

Pacific Components Ltd. fails. The PX-17 Power Controller is at risk: 8 days of
inventory, $2.4M exposure. Three alternatives. The cheapest, Shenzhen Rapid Parts at
0.85× baseline, claims *"Established 2018"*.

Four independent systems disagree:

| Source | Finding |
|---|---|
| Business registration (Nutrient) | `FORMED: 2021-06-08` — not 2018 |
| ISO 9001 certificate (Nutrient) | `REGISTRY_MATCH: NOT FOUND`, issuer unaccredited |
| Live web (SerpApi) | almost no independent corroboration |
| Domain system (name.com) | `shenzhenrapidparts.com` is unregistered and for sale |

A supplier can forge a PDF. Getting all four to agree is much harder.

### The part I care about most: the verdicts are computed, not scripted

It would have been easy — and dishonest — to hardcode "this document is the
conflicted one". The verification rules match on document **type** and then read
**fields**:

- `entity-age-vs-registry` compares the founding year a supplier claims publicly
  against the `FORMED` date on its own registration.
- `certificate-registry-match` reads the registry match, the issuer's accreditation
  and the expiry date, independently.
- `product-equivalence` checks the datasheet names the part actually at risk.

No rule mentions a filename. Change `FORMED` to 2018 and the conflict disappears on
the next run. `tests/rules.test.ts` pins exactly that: same code, mutated fields,
different verdicts.

### You cannot weight your way to a bad supplier

The risk model is fully transparent and live-adjustable. Drag the cost weight to
maximum — the setting that should favour the cheapest supplier — and it still loses.
A supplier carrying an unresolved evidence conflict is capped at `INTEGRITY_CAP = 49`
at any weighting, and the pre-gate score is shown alongside the capped one so the
gate is visible rather than hidden.

### Your agent shouldn't sign that

Foxit drew this line first: their MCP server exposes ~40 **reversible** PDF
operations as agent tools, and signing is deliberately not one of them. AegisFlow
turns that API-design opinion into an enforced property of the application.
`lib/state/agent-tools.ts` registers every document operation with a risk class
(REVERSIBLE / IRREVERSIBLE) and the actors allowed to invoke it. `esign.createFolder`
is the only irreversible entry: HUMAN-only, valid from exactly one state.
`tests/agent-tools.test.ts` enumerates every actor × every workflow state and asserts
no non-human combination can reach it.

### Honesty as a feature

Every sponsor API call — live, local fallback, or seeded — lands in an open
**Integration Activity Ledger** with its real request and response, tagged `LIVE`,
`LOCAL` or `DEMO SEEDED`. The configuration table says CONFIGURED, not LIVE, because
a key being present is not proof a call succeeded — the ledger is the record. The
whole workflow runs end to end with zero keys, on honest fallbacks.

### What I learned

Most of the hard problems were not the AI.

**Extractors are not interchangeable.** Nutrient DWS drops underscores from field
names depending on glyph spacing — inconsistently, keeping `REGISTRY_MATCH` on one
certificate while producing `VALIDUNTIL` and `ABOUTPAGECLAIM` on another. Going live
silently dropped the founding-year conflict, the demo's entire point. Field lookup is
now normalisation-tolerant, with a regression test built from DWS's verbatim output.

**Serverless breaks background work.** Writes went through a paced queue so a
rate-limited write never blocked a render — correct on a long-lived server, wrong on
Vercel, where the function freezes the moment the response closes. Runs streamed
perfectly and persisted nothing.

**A silent no-op is worse than an error.** The write carrying a run did
`if (!row) return;` on an empty read — reporting success while discarding everything.
It now throws.

**Rate limits force you to decide what matters.** Xano's free tier is 10 requests per
20 seconds; a run was making triple that, mostly audit rows, starving the one write
that carried the result. The audit stream now rides with the evidence in a single
request.

**Two products can share a name.** Foxit ships eSign standalone (OAuth2, own keys)
and on the unified platform (header auth, shared keys). I applied the wrong one's
docs and concluded the credentials were wrong. They were fine.

### What's next

Continuous supplier monitoring rather than incident-triggered investigation;
pre-cleared alternate-supplier playbooks; and pushing the verification rules from a
curated set toward something a risk team can author themselves.
