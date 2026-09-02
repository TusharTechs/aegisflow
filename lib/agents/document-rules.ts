/**
 * Verification rules.
 *
 * Every verdict below is COMPUTED from the values that Nutrient DWS (or the local
 * fallback extractor) pulled out of the PDF. No rule is keyed on which document it
 * came from — they match on document *type* and then read *fields*.
 *
 * That distinction is the whole point. Change `FORMED` in the Shenzhen business
 * registration to 2018 and the "Established 2018" conflict disappears on the next
 * run. Put a certificate id in `REGISTRY_MATCH` and the ISO claim verifies. Expire
 * a certificate and it drops to UNVERIFIED on its own. The engine detects the
 * contradiction; it does not replay a scripted one.
 *
 * `tests/rules.test.ts` pins exactly that: same code, mutated fields, different
 * verdicts.
 */

export type ClaimSubject =
  | "iso-9001"
  | "entity-age"
  | "entity-registered"
  | "registration-status"
  | "product-compatibility"
  | "lead-time";

export interface DerivedClaim {
  supplierId: string;
  subject: ClaimSubject;
  text: string;
  confidence: number;
  status: "VERIFIED" | "UNVERIFIED" | "CONFLICT";
  conflictReason?: string;
  /** The extracted field this verdict was read from — the provenance anchor. */
  field: string;
  /** Which rule produced it, surfaced in the UI so a reviewer can audit the logic. */
  rule: string;
}

export type ExtractedFields = Record<string, string>;

export interface RuleContext {
  supplierId: string;
  /** The component the incident is about — used to judge stated equivalence. */
  affectedProduct?: string;
}

export interface VerificationRule {
  id: string;
  description: string;
  appliesTo: (documentType: string) => boolean;
  run: (fields: ExtractedFields, ctx: RuleContext) => DerivedClaim[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Field names are read out of a PDF, so their exact spelling is not stable.
 * Nutrient DWS drops underscores depending on how the glyphs are spaced in the
 * source document — the same run can yield `REGISTRY_MATCH` on one certificate and
 * `VALIDUNTIL`, `CERTNUMBER`, `ABOUTPAGECLAIM` on another. Comparing canonical
 * forms makes a rule independent of which extractor produced the text, which is
 * the whole point of having the extractor be swappable.
 */
const canonical = (key: string) => key.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Strip everything but letters and digits.
 *
 * Extraction inserts spaces INSIDE words depending on glyph kerning — DWS returned
 * `PX-17 Power C ontroller` for a datasheet that reads "PX-17 Power Controller", and
 * the same can happen to `NOT FOUND`, an issuer name or `Active`. Collapsing runs of
 * spaces does not help, because the word is already split. Every rule that matches
 * on a field's CONTENT compares this form; anything shown to a human uses the raw
 * value, so the UI still quotes the document verbatim.
 */
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Read a field by any of its accepted spellings. */
export function readField(fields: ExtractedFields, ...names: string[]): string | undefined {
  const index = new Map<string, string>();
  for (const [key, value] of Object.entries(fields)) {
    const c = canonical(key);
    if (!index.has(c)) index.set(c, value);
  }
  for (const name of names) {
    const hit = index.get(canonical(name));
    if (hit !== undefined && hit.trim() !== "") return hit.trim();
  }
  return undefined;
}

/** First 4-digit year in a field value, if there is one. */
export function yearOf(value?: string): number | undefined {
  const m = value?.match(/\b(?:19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : undefined;
}

/**
 * Registrars whose ISO 9001 certificates are issued under an accreditation body.
 * An issuer outside this set is not proof of fraud — it is grounds to withhold
 * VERIFIED until something independent corroborates it.
 */
const ACCREDITED_ISSUER = /tuv|sgs|bureauveritas|dnv|intertek|lloyds|bsi|dekra|ulsolutions|afnor|kiwa/;

/** A registry lookup that came back empty, however the extractor phrased it. */
const NEGATIVE_REGISTRY = /^(notfound|nomatch|norecord|none|absent|na|unknown|nil)$/;

/**
 * Which underlying assertion a claim is about. Used to match a claim extracted
 * from a document against the supplier's own stated claim, without either side
 * hardcoding the other's id.
 */
export function classifyClaim(text: string): ClaimSubject | undefined {
  const t = text.toLowerCase();
  if (/\biso\s*9001\b/.test(t)) return "iso-9001";
  if (/\bregistered entity since\b/.test(t)) return "entity-registered";
  if (/\bregistration status\b|\bactive business registration\b/.test(t)) return "registration-status";
  if (/\bestablished\b|\bfounded\b|\bin business since\b|\boperating since\b/.test(t)) return "entity-age";
  if (/\bcompatib|\bequivalent\b|\bcross-?reference\b/.test(t)) return "product-compatibility";
  if (/\blead time\b|\bday\b|\bshipping\b|\bexpedited\b/.test(t)) return "lead-time";
  return undefined;
}

/**
 * Rule 1 — cross-check the supplier's public founding claim against the registry.
 *
 * The business registration is treated as ground truth: it is issued by a state
 * authority, the About-page copy is not. When the document carries both, they get
 * compared. Agreement verifies the claim; disagreement is a CONFLICT whose
 * confidence falls as the gap widens.
 */
const entityAgeVsRegistry: VerificationRule = {
  id: "entity-age-vs-registry",
  description:
    "Compares the founding year a supplier claims publicly against the FORMED date on its business registration.",
  appliesTo: (type) => /business registration|business licen[cs]e|trade registry/i.test(type),
  run: (f, ctx) => {
    const formed = readField(f, "FORMED", "FORMATION_DATE", "INCORPORATED");
    const formedYear = yearOf(formed);
    if (formedYear === undefined) return [];

    const out: DerivedClaim[] = [];
    const status = readField(f, "STATUS");
    const statusActive = /active/.test(compact(status ?? ""));

    out.push({
      supplierId: ctx.supplierId,
      subject: "entity-registered",
      text: `Registered entity since ${formedYear}`,
      confidence: clamp(95 + (readField(f, "REGISTRY") ? 2 : 0)),
      status: "VERIFIED",
      field: "FORMED",
      rule: "entity-age-vs-registry",
    });

    out.push({
      supplierId: ctx.supplierId,
      subject: "registration-status",
      text: statusActive ? "Active business registration status" : "Business registration is not active",
      confidence: clamp(statusActive ? 95 : 40),
      status: statusActive ? "VERIFIED" : "UNVERIFIED",
      conflictReason: statusActive ? undefined : `Registration STATUS reads "${status ?? "unknown"}".`,
      field: "STATUS",
      rule: "entity-age-vs-registry",
    });

    // The supplier's own public founding claim, when the extraction captured it.
    const publicClaim = readField(f, "ABOUT_PAGE_CLAIM", "PUBLIC_CLAIM", "WEBSITE_CLAIM");
    const claimedYear = yearOf(publicClaim);
    if (claimedYear !== undefined) {
      const gap = Math.abs(formedYear - claimedYear);
      const agrees = gap === 0;
      out.push({
        supplierId: ctx.supplierId,
        subject: "entity-age",
        text: (publicClaim ?? `Established ${claimedYear}`).trim(),
        confidence: agrees ? 95 : clamp(60 - gap * 10),
        status: agrees ? "VERIFIED" : "CONFLICT",
        conflictReason: agrees
          ? undefined
          : `Supplier materials claim ${claimedYear}; the business registration shows FORMED ${formed}. ` +
            `${gap} year${gap === 1 ? "" : "s"} of operating history cannot be substantiated.`,
        field: "FORMED",
        rule: "entity-age-vs-registry",
      });
    }

    return out;
  },
};

/**
 * Rule 2 — a certificate is only as good as the registry that backs it.
 *
 * Three independent things can withhold VERIFIED: the issuing registry has no
 * matching record, the issuer is not an accreditation body, or the certificate has
 * expired. Each one is read from a field and each one is reported separately.
 */
const certificateRegistryMatch: VerificationRule = {
  id: "certificate-registry-match",
  description:
    "Verifies an ISO 9001 certificate against its registry match, the accreditation status of its issuer, and its expiry date.",
  appliesTo: (type) => /certificat|iso\s*9001/i.test(type),
  run: (f, ctx) => {
    const isIso9001 = /\biso\s*9001\b/i.test(
      `${readField(f, "DOC_TYPE") ?? ""} ${readField(f, "SCOPE") ?? ""}`
    );
    if (!isIso9001) return [];

    let confidence = 90;
    let status: DerivedClaim["status"] = "VERIFIED";
    const failures: string[] = [];
    let anchorField = "CERT_NUMBER";

    if (readField(f, "CERT_NUMBER", "CERTIFICATE_NUMBER")) confidence += 3;

    const registryMatch = readField(f, "REGISTRY_MATCH", "REGISTRY_LOOKUP");
    if (registryMatch !== undefined && NEGATIVE_REGISTRY.test(compact(registryMatch))) {
      status = "UNVERIFIED";
      confidence = confidence * 0.6;
      anchorField = "REGISTRY_MATCH";
      failures.push(`the certificate registry returned REGISTRY_MATCH: ${registryMatch.trim()}`);
    }

    const issuer = (readField(f, "ISSUER", "ISSUING_BODY") ?? "").trim();
    if (issuer) {
      if (ACCREDITED_ISSUER.test(compact(issuer))) {
        confidence += 5;
      } else {
        status = "UNVERIFIED";
        confidence = confidence * 0.9;
        if (anchorField === "CERT_NUMBER") anchorField = "ISSUER";
        failures.push(`the issuing body "${issuer}" is not an accredited registrar`);
      }
    }

    const validUntilRaw = readField(f, "VALID_UNTIL", "EXPIRES", "EXPIRY");
    const validUntil = validUntilRaw ? Date.parse(validUntilRaw) : NaN;
    if (!Number.isNaN(validUntil) && validUntil < Date.now()) {
      status = "UNVERIFIED";
      confidence = confidence * 0.7;
      anchorField = "VALID_UNTIL";
      failures.push(`the certificate expired on ${validUntilRaw}`);
    }

    return [
      {
        supplierId: ctx.supplierId,
        subject: "iso-9001",
        text: "ISO 9001 Certified",
        confidence: clamp(confidence),
        status,
        conflictReason: failures.length
          ? `Cannot be treated as verified because ${failures.join("; and ")}.`
          : undefined,
        field: anchorField,
        rule: "certificate-registry-match",
      },
    ];
  },
};

/**
 * Rule 3 — stated equivalence only counts when it names the part actually at risk.
 *
 * A datasheet claiming equivalence to some other component is not evidence for
 * this incident, so the affected product has to appear in EQUIVALENT_TO.
 */
const productEquivalence: VerificationRule = {
  id: "product-equivalence",
  description:
    "Confirms a datasheet's stated equivalence names the component the incident is actually about.",
  appliesTo: (type) => /product specification|datasheet|technical spec/i.test(type),
  run: (f, ctx) => {
    const equivalent = readField(f, "EQUIVALENT_TO", "EQUIVALENT", "CROSS_REFERENCE");
    if (!equivalent || !ctx.affectedProduct) return [];

    const matches = compact(equivalent).includes(compact(ctx.affectedProduct));
    return [
      {
        supplierId: ctx.supplierId,
        subject: "product-compatibility",
        text: `${ctx.affectedProduct} direct compatibility`,
        confidence: matches ? 96 : 35,
        status: matches ? "VERIFIED" : "UNVERIFIED",
        conflictReason: matches
          ? undefined
          : `Datasheet states equivalence to "${equivalent}", which is not the ${ctx.affectedProduct}.`,
        field: "EQUIVALENT_TO",
        rule: "product-equivalence",
      },
    ];
  },
};

export const VERIFICATION_RULES: VerificationRule[] = [
  entityAgeVsRegistry,
  certificateRegistryMatch,
  productEquivalence,
];

/**
 * Run every rule that applies to this document type over its extracted fields.
 * Documents with no supplier (e.g. the incumbent's master supply agreement) carry
 * no supplier claims, so no rule fires for them.
 */
export function deriveClaims(
  documentType: string,
  fields: ExtractedFields,
  ctx: RuleContext
): DerivedClaim[] {
  return VERIFICATION_RULES.filter((r) => r.appliesTo(documentType)).flatMap((r) => r.run(fields, ctx));
}
