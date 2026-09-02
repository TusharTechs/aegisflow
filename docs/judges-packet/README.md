# AegisFlow — verification packet

**Live:** https://aegisflow-ai.vercel.app · **Repo:** https://github.com/TusharTechs/aegisflow

The product's argument is that you should not take a supplier's word for anything.
It would be inconsistent to then ask you to take ours. Everything below is checkable
in about five minutes, and the things we *cannot* prove are listed at the bottom.

---

## In 60 seconds

Open the live app and press **Run Response** on `INC-1042`. Then:

| Look at | What it shows |
|---|---|
| `/incidents/INC-1042` | Four independent findings against the cheapest supplier, each naming the rule that produced it |
| `/incidents/INC-1042/why` | Select **Shenzhen Rapid Parts**, drag **Cost** to maximum. It stays at 49/100 |
| `/integrations` | Every sponsor API call with its real request and response, tagged LIVE / LOCAL / DEMO SEEDED |
| `/audit` | Append-only trail; every entry carries its actor — SYSTEM, AI or HUMAN |

---

## The claim we most want checked: verdicts are computed, not scripted

The easy, dishonest version of this demo hardcodes "this document is the conflicted
one". Ours does not. Check it three ways:

**1. No rule mentions a filename.**

```bash
grep -n "appliesTo" lib/agents/document-rules.ts
```

Rules match on document *type*, then read *fields*.

**2. Mutating a field flips the verdict.**

```bash
npx vitest run tests/rules.test.ts
```

22 tests. Same rule code, different extracted values, different outcomes — including
`FORMED: 2018` making the conflict disappear entirely.

**3. It survives a change of extractor.**

Extraction mangles text in two ways, and both were live bugs before they were tests.
DWS drops underscores from field NAMES inconsistently — `REGISTRY_MATCH` survives on
one certificate while the same run yields `VALIDUNTIL` and `ABOUTPAGECLAIM` on
another. It also inserts spaces inside WORDS from glyph kerning: it returned
`PX-17 Power C ontroller` for a datasheet reading "PX-17 Power Controller". Left
unhandled, the first silently dropped the founding-year conflict and the second
downgraded the recommended supplier. Both blocks in that test file are built from
DWS's verbatim output and assert the verdicts hold either way.

---

## The Foxit claim: the agent has no path to a signature

```bash
npx vitest run tests/agent-tools.test.ts
```

`lib/state/agent-tools.ts` registers every document operation with a risk class and
the actors permitted to invoke it. The test enumerates **every actor × every workflow
state** and asserts no non-human combination can reach `esign.createFolder`. A second
guard, `assertHumanMaySign`, holds the same line independently, and
`tests/guards.test.ts` drives the pipeline to `SIGNATURE_REQUIRED` and asserts the AI
is refused even calling the raw transition.

---

## The integrity gate

```bash
grep -n "INTEGRITY_CAP\|applyIntegrityCap" lib/risk/weights.ts lib/risk/engine.ts
npx vitest run tests/risk.test.ts
```

One test sets every weight to zero except cost, asserts the conflicted supplier's
*pre-gate* score would win, and that the gated score does not.

---

## What is in this packet

```
evidence-pdfs/     the six supplier documents the run reads
generated/         a real Doctavian output (see below)
```

**`generated/emergency-supplier-transition-agreement-DOCTAVIAN.pdf`** is a genuine
Doctavian render, not a mockup. Two things to notice:

- Values, currency formatting and the repeated compliance list all resolved from a
  Zod-validated payload — no free-text prompt anywhere in the chain.
- **Article 4 carries an unverified-claims notice.** That paragraph is an
  `mdoc:paragraph` whose `hidden` expression reads
  `evidenceSummary.conflicts < 1`. It appears *only* because this run found a
  conflict. Verified both ways against the live API: `conflicts: 1` prints it,
  `conflicts: 0` hides it. The contract discloses its own evidence position on its
  face, driven by data.

---

## Run it yourself with no keys at all

```bash
git clone https://github.com/TusharTechs/aegisflow && cd aegisflow
npm install && node scripts/generate-pdfs.mjs
npm run dev            # http://localhost:3000
npm test               # 67 passing
```

The full workflow runs end to end on honest fallbacks. Every screen stays usable and
every fallback is labelled as one.

---

## What we do not claim

- **No autonomous procurement.** The AI cannot approve, reject or sign. That is the product.
- **The suppliers are fictional**, and everything derived from them is tagged. Where
  the demo entities cannot be corroborated on the live web, the app says so in the
  ledger rather than inventing corroboration.
- **`CONFIGURED` is not `LIVE`.** The integrations table reports whether a key is
  present. Whether a call actually answered is decided by the run, and the ledger is
  the record — that distinction is deliberate.
- **Nutrient may show LOCAL** if the credit grant is exhausted when you look. The code
  path is identical; the ledger will say which happened and why.
- **Market figures on `/business`** are order-of-magnitude framing, not audited data.
