import { describe, expect, it, beforeEach } from "vitest";
import { candidateDomain, runDomainIntelligence } from "@/lib/agents/domain-intelligence";
import { evaluateAll } from "@/lib/risk/engine";
import { ActivityLedger } from "@/lib/integrations/ledger";
import { setDemoFlag } from "@/lib/orchestration/demo-controls";
import { fixture } from "./fixtures";

beforeEach(() => setDemoFlag("namecom", false));

describe("supplier domain footprint (name.com)", () => {
  it("derives the domain a company of that name would trade under", () => {
    const incident = fixture();
    const [apex, nexus, shenzhen] = incident.alternativeSuppliers;
    expect(candidateDomain(apex)).toBe("apexelectronics.com");
    expect(candidateDomain(nexus)).toBe("nexusmanufacturing.com");
    expect(candidateDomain(shenzhen)).toBe("shenzhenrapidparts.com");
  });

  it("treats a purchasable domain as absence of commercial footprint", async () => {
    const incident = fixture();
    const { footprints } = await runDomainIntelligence(incident);

    const shenzhen = footprints.find((f) => f.supplierId === "SUP-C")!;
    expect(shenzhen.purchasable).toBe(true);
    expect(shenzhen.signal).toBe("NO_FOOTPRINT");

    for (const id of ["SUP-A", "SUP-B"]) {
      expect(footprints.find((f) => f.supplierId === id)!.signal).toBe("CORROBORATED");
    }
  });

  it("records the call in the ledger with the real request body", async () => {
    const ledger = new ActivityLedger();
    await runDomainIntelligence(fixture(), ledger);

    const call = ledger.all().find((c) => c.sponsor === "name.com")!;
    expect(call.method).toBe("POST");
    expect(call.endpoint).toContain("/core/v1/domains:checkAvailability");
    expect((call.request as { domainNames: string[] }).domainNames).toContain("shenzhenrapidparts.com");
  });

  it("degrades to the observed fallback when the API fails, and says so", async () => {
    setDemoFlag("namecom", true);
    const ledger = new ActivityLedger();
    const { footprints, liveCount } = await runDomainIntelligence(fixture(), ledger);

    expect(liveCount).toBe(0);
    expect(footprints).toHaveLength(3);
    expect(footprints.every((f) => f.mode === "DEMO SEEDED")).toBe(true);
    expect(ledger.all().find((c) => c.sponsor === "name.com")!.mode).toBe("DEMO SEEDED");
  });

  it("costs the conflicted supplier reliability score once the footprint is known", async () => {
    const withoutFootprint = fixture();
    const before = evaluateAll(withoutFootprint).find((e) => e.supplierId === "SUP-C")!;

    const withFootprint = fixture();
    withFootprint.domainFootprints = (await runDomainIntelligence(withFootprint)).footprints;
    const after = evaluateAll(withFootprint).find((e) => e.supplierId === "SUP-C")!;

    expect(after.scores.reliability).toBeLessThan(before.scores.reliability);
    expect(after.dimensions.find((d) => d.key === "reliability")!.reasons.join(" ")).toContain(
      "shenzhenrapidparts.com"
    );
  });

  it("does not change the outcome for suppliers whose domain is registered", async () => {
    const incident = fixture();
    incident.domainFootprints = (await runDomainIntelligence(incident)).footprints;
    const nexus = evaluateAll(incident).find((e) => e.supplierId === "SUP-B")!;

    expect(nexus.dimensions.find((d) => d.key === "reliability")!.reasons.join(" ")).toContain("is registered");
    expect(nexus.disqualified).toBe(false);
  });
});
