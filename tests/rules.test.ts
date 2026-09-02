import { describe, expect, it } from "vitest";
import { classifyClaim, deriveClaims, yearOf, VERIFICATION_RULES } from "@/lib/agents/document-rules";

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
