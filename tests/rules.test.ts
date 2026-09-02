import { describe, expect, it } from "vitest";
import { classifyClaim, deriveClaims, readField, yearOf, VERIFICATION_RULES } from "@/lib/agents/document-rules";

/**
 * The point of these tests is that the verdicts are COMPUTED, not scripted.
 *
 * Each case feeds the same rule code a different set of extracted field values and
 * asserts the verdict moves. If any verdict were keyed on a document id, mutating a
 * field could not change it — and every one of these would fail.
 */

const REGISTRATION = "Business Registration";
const CERTIFICATE = "ISO 9001 Certificate (copy)";
const SPEC = "Product Specification";

const shenzhenRegistration = {
  DOC_TYPE: "Business Registration",
  ENTITY: "Shenzhen Rapid Parts Ltd",
  REGISTRY: "Shenzhen AMR",
  FORMED: "2021-06-08",
  STATUS: "Active",
  ABOUT_PAGE_CLAIM: "Established 2018",
};

const shenzhenCertificate = {
  DOC_TYPE: "ISO 9001 Certificate (copy)",
  HOLDER: "Shenzhen Rapid Parts Ltd",
  CERT_NUMBER: "SR-2024-114",
  ISSUER: "Unaccredited certification body",
  ISSUED: "2024-11-01",
  VALID_UNTIL: "2027-10-31",
  REGISTRY_MATCH: "NOT FOUND",
};

const ctx = { supplierId: "SUP-C", affectedProduct: "PX-17 Power Controller" };

describe("verification rules are derived, not scripted", () => {
  it("flags the founding-year contradiction from the extracted fields", () => {
    const claims = deriveClaims(REGISTRATION, shenzhenRegistration, ctx);
    const age = claims.find((c) => c.subject === "entity-age")!;

    expect(age.status).toBe("CONFLICT");
    expect(age.conflictReason).toContain("2018");
    expect(age.conflictReason).toContain("2021");
    expect(age.field).toBe("FORMED");
  });

  it("CLEARS that conflict when the registration actually supports the claim", () => {
    // Same rule, same code path — only the extracted FORMED value changes.
    const claims = deriveClaims(REGISTRATION, { ...shenzhenRegistration, FORMED: "2018-06-08" }, ctx);
    const age = claims.find((c) => c.subject === "entity-age")!;

    expect(age.status).toBe("VERIFIED");
    expect(age.conflictReason).toBeUndefined();
  });

  it("scales confidence with the size of the discrepancy", () => {
    const near = deriveClaims(REGISTRATION, { ...shenzhenRegistration, FORMED: "2020-01-01" }, ctx)
      .find((c) => c.subject === "entity-age")!;
    const far = deriveClaims(REGISTRATION, { ...shenzhenRegistration, FORMED: "2024-01-01" }, ctx)
      .find((c) => c.subject === "entity-age")!;

    expect(near.confidence).toBeGreaterThan(far.confidence);
  });

  it("withholds VERIFIED when the certificate registry has no matching record", () => {
    const iso = deriveClaims(CERTIFICATE, shenzhenCertificate, ctx).find((c) => c.subject === "iso-9001")!;

    expect(iso.status).toBe("UNVERIFIED");
    expect(iso.conflictReason).toMatch(/REGISTRY_MATCH/);
    expect(iso.field).toBe("REGISTRY_MATCH");
  });

  it("VERIFIES the same certificate once the registry matches and the issuer is accredited", () => {
    const iso = deriveClaims(
      CERTIFICATE,
      { ...shenzhenCertificate, REGISTRY_MATCH: "SR-2024-114", ISSUER: "TUV Rheinland" },
      ctx
    ).find((c) => c.subject === "iso-9001")!;

    expect(iso.status).toBe("VERIFIED");
    expect(iso.confidence).toBeGreaterThan(90);
  });

  it("catches an expired certificate on the date alone", () => {
    const iso = deriveClaims(
      CERTIFICATE,
      { ...shenzhenCertificate, REGISTRY_MATCH: "SR-2024-114", ISSUER: "TUV Rheinland", VALID_UNTIL: "2020-01-01" },
      ctx
    ).find((c) => c.subject === "iso-9001")!;

    expect(iso.status).toBe("UNVERIFIED");
    expect(iso.conflictReason).toContain("expired");
  });

  it("only credits stated equivalence when it names the part actually at risk", () => {
    const match = deriveClaims(SPEC, { EQUIVALENT_TO: "PX-17 Power Controller" }, ctx)
      .find((c) => c.subject === "product-compatibility")!;
    const mismatch = deriveClaims(SPEC, { EQUIVALENT_TO: "QR-99 Relay Module" }, ctx)
      .find((c) => c.subject === "product-compatibility")!;

    expect(match.status).toBe("VERIFIED");
    expect(mismatch.status).toBe("UNVERIFIED");
    expect(mismatch.conflictReason).toContain("QR-99 Relay Module");
  });

  it("marks a registration that is not active", () => {
    const status = deriveClaims(REGISTRATION, { ...shenzhenRegistration, STATUS: "Revoked" }, ctx)
      .find((c) => c.subject === "registration-status")!;

    expect(status.status).toBe("UNVERIFIED");
    expect(status.conflictReason).toContain("Revoked");
  });

  it("no rule is keyed on a document id — the same fields decide for any supplier", () => {
    const asC = deriveClaims(REGISTRATION, shenzhenRegistration, ctx);
    const asA = deriveClaims(REGISTRATION, shenzhenRegistration, { ...ctx, supplierId: "SUP-A" });

    expect(asA.map((c) => ({ ...c, supplierId: "SUP-C" }))).toEqual(asC);
  });

  it("every rule reports which field and which rule produced its verdict", () => {
    const all = [
      ...deriveClaims(REGISTRATION, shenzhenRegistration, ctx),
      ...deriveClaims(CERTIFICATE, shenzhenCertificate, ctx),
      ...deriveClaims(SPEC, { EQUIVALENT_TO: "PX-17 Power Controller" }, ctx),
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const c of all) {
      expect(c.field).toBeTruthy();
      expect(VERIFICATION_RULES.map((r) => r.id)).toContain(c.rule);
    }
  });
});

describe("claim subject classification", () => {
  it("routes each claim to the assertion it is about", () => {
    expect(classifyClaim("ISO 9001 Certified")).toBe("iso-9001");
    expect(classifyClaim("Established 2018")).toBe("entity-age");
    expect(classifyClaim("Registered entity since 2021")).toBe("entity-registered");
    expect(classifyClaim("Active business registration status")).toBe("registration-status");
    expect(classifyClaim("PX-17 direct compatibility")).toBe("product-compatibility");
    expect(classifyClaim("3-day expedited shipping available")).toBe("lead-time");
  });

  it("keeps 'registered entity since' distinct from a public founding claim", () => {
    // Both mention a year; conflating them would let a registry fact overwrite the
    // marketing claim it is supposed to contradict.
    expect(classifyClaim("Registered entity since 2021")).not.toBe(classifyClaim("Established 2018"));
  });
});

describe("yearOf", () => {
  it("pulls a four-digit year out of any field format", () => {
    expect(yearOf("2021-06-08")).toBe(2021);
    expect(yearOf("Established 2018")).toBe(2018);
    expect(yearOf("no year here")).toBeUndefined();
    expect(yearOf(undefined)).toBeUndefined();
  });
});

/**
 * Regression: the same rules must produce the same verdicts whichever extractor
 * read the PDF.
 *
 * Nutrient DWS drops underscores from field names depending on glyph spacing in
 * the source document — and it does so inconsistently, keeping `REGISTRY_MATCH` on
 * one certificate while stripping `VALIDUNTIL` and `CERTNUMBER` on the same page.
 * The fixtures below are the verbatim `plainText` DWS returned for these PDFs.
 * Before `readField` matched canonically, going LIVE on Nutrient silently dropped
 * the founding-year conflict — the demo's whole point — because the rule was
 * looking for `ABOUT_PAGE_CLAIM` and the extractor had produced `ABOUTPAGECLAIM`.
 */
describe("extractor-independence (real Nutrient DWS output)", () => {
  const nutrientRegistration = {
    DOCTYPE: "Business Registration",
    ENTITY: "Shenzhen Rapid Parts Ltd",
    REGISTRY: "Shenzhen AMR",
    REGNUMBER: "91440300MA5H 2X",
    FORMED: "2021-06-08",
    STATUS: "Active",
    ABOUTPAGECLAIM: "Established 2018",
  };

  const nutrientCertificate = {
    DOC_TYPE: "ISO 9001 Certificate (copy)",
    HOLDER: "Shenzhen Rapid Parts Ltd",
    CERTNUMBER: "SR-2024-114",
    ISSUER: "Unaccredited certification body",
    ISSUED: "2024-11-01",
    VALIDUNTIL: "2027-10-31",
    REGISTRY_MATCH: "NOT FOUND",
  };

  it("still finds the founding-year conflict when DWS strips the underscores", () => {
    const age = deriveClaims(REGISTRATION, nutrientRegistration, ctx).find((c) => c.subject === "entity-age")!;
    expect(age.status).toBe("CONFLICT");
    expect(age.conflictReason).toContain("2018");
    expect(age.conflictReason).toContain("2021");
  });

  it("still withholds the certificate when DWS strips the underscores", () => {
    const iso = deriveClaims(CERTIFICATE, nutrientCertificate, ctx).find((c) => c.subject === "iso-9001")!;
    expect(iso.status).toBe("UNVERIFIED");
    expect(iso.conflictReason).toMatch(/REGISTRY_MATCH|registry/i);
  });

  it("reaches identical verdicts from Nutrient text and local text", () => {
    const viaNutrient = deriveClaims(REGISTRATION, nutrientRegistration, ctx);
    const viaLocal = deriveClaims(REGISTRATION, shenzhenRegistration, ctx);
    expect(viaNutrient.map((c) => [c.subject, c.status, c.confidence])).toEqual(
      viaLocal.map((c) => [c.subject, c.status, c.confidence])
    );
  });

  it("reads a field under any spelling the extractor produces", () => {
    for (const key of ["ABOUT_PAGE_CLAIM", "ABOUTPAGECLAIM", "about page claim"]) {
      expect(readField({ [key]: "Established 2018" }, "ABOUT_PAGE_CLAIM")).toBe("Established 2018");
    }
    expect(readField({ FORMED: "   " }, "FORMED")).toBeUndefined();
  });
});

/**
 * Regression: extraction splits words, not just field names.
 *
 * DWS returned `EQUIVALENT_TO: 'PX-17 Power C ontroller'` for a datasheet that reads
 * "PX-17 Power Controller" — a space inserted mid-word from glyph kerning. That
 * silently flipped the RECOMMENDED supplier's compatibility claim to UNVERIFIED and
 * cost it points, with nothing in the UI hinting the cause was an extraction artefact.
 * The same hazard applies to every value a rule matches on.
 */
describe("field values survive mid-word splits from extraction", () => {
  it("credits equivalence when the extractor split the product name", () => {
    const c = deriveClaims(SPEC, { EQUIVALENT_TO: "PX-17 Power C ontroller" }, ctx)
      .find((x) => x.subject === "product-compatibility")!;
    expect(c.status).toBe("VERIFIED");
  });

  it("still rejects equivalence to a genuinely different part", () => {
    const c = deriveClaims(SPEC, { EQUIVALENT_TO: "QR-99 R elay Module" }, ctx)
      .find((x) => x.subject === "product-compatibility")!;
    expect(c.status).toBe("UNVERIFIED");
  });

  it("reads a split NOT FOUND as an empty registry lookup", () => {
    const iso = deriveClaims(
      CERTIFICATE,
      { ...shenzhenCertificate, REGISTRY_MATCH: "NOT F OUND" },
      ctx
    ).find((x) => x.subject === "iso-9001")!;
    expect(iso.status).toBe("UNVERIFIED");
  });

  it("recognises an accredited issuer whose name was split", () => {
    const iso = deriveClaims(
      CERTIFICATE,
      { ...shenzhenCertificate, REGISTRY_MATCH: "SR-2024-114", ISSUER: "TU V Rheinland" },
      ctx
    ).find((x) => x.subject === "iso-9001")!;
    expect(iso.status).toBe("VERIFIED");
  });

  it("reads a split Active status as active", () => {
    const st = deriveClaims(REGISTRATION, { ...shenzhenRegistration, STATUS: "Act ive" }, ctx)
      .find((x) => x.subject === "registration-status")!;
    expect(st.status).toBe("VERIFIED");
  });
});
