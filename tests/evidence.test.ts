import { describe, expect, it } from "vitest";
import path from "path";
import { verifyClaims } from "@/lib/agents/verification";
import { runDocumentIntelligence, mergeDocClaims } from "@/lib/agents/document-intelligence";
import { extractTextLocal } from "@/integrations/nutrient/local-extract";
import { fixture } from "./fixtures";

describe("evidence engine", () => {
  it("extracts seeded fields from generated PDFs", async () => {
    const text = await extractTextLocal(path.join(process.cwd(), "public/docs/shenzhen-business-registration.pdf"));
    expect(text).toContain("FORMED: 2021-06-08");
    expect(text).toContain("ABOUT_PAGE_CLAIM: Established 2018");
  });

  it("detects the seeded conflict and unverified certification", () => {
    const report = verifyClaims(fixture());
    expect(report.conflicts).toBe(1);
    expect(report.unverified).toBe(1);
    expect(report.verified).toBe(4);
  });

  it("derives claims from documents and is idempotent on re-merge", async () => {
    const incident = fixture();
    const report = await runDocumentIntelligence();
    expect(report.documents.length).toBe(6);
    expect(report.totalFields).toBe(47);

    mergeDocClaims(incident, report);
    const countAfterFirst = incident.alternativeSuppliers.reduce((a, s) => a + s.claims.length, 0);
    mergeDocClaims(incident, report);
    const countAfterSecond = incident.alternativeSuppliers.reduce((a, s) => a + s.claims.length, 0);
    expect(countAfterSecond).toBe(countAfterFirst);

    const post = verifyClaims(incident);
    expect(post.verified).toBe(8);
    expect(post.conflicts).toBe(1);
  });

  it("adjudicates the supplier's stated claims against the documents", async () => {
    const incident = fixture();
    const shenzhen = incident.alternativeSuppliers.find((s) => s.id === "SUP-C")!;

    // Before the documents are read, both claims are the supplier's word.
    expect(shenzhen.claims.find((c) => c.text === "Established 2018")!.documentEvidence).toBeUndefined();

    mergeDocClaims(incident, await runDocumentIntelligence(undefined, { affectedProduct: incident.affectedProduct }));

    const age = shenzhen.claims.find((c) => c.text === "Established 2018")!;
    expect(age.status).toBe("CONFLICT");
    expect(age.documentEvidence).toEqual({
      documentId: "shenzhen-business-registration",
      field: "FORMED",
      mode: "LOCAL",
      rule: "entity-age-vs-registry",
    });

    const iso = shenzhen.claims.find((c) => c.text === "ISO 9001 Certified")!;
    expect(iso.status).toBe("UNVERIFIED");
    expect(iso.documentEvidence?.rule).toBe("certificate-registry-match");
  });
});