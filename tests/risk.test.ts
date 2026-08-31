import { describe, expect, it } from "vitest";
import { evaluateAll } from "@/lib/risk/engine";
import { rankSuppliers } from "@/lib/suppliers/ranking";
import { computeTotal, DEFAULT_WEIGHTS, DimensionKey } from "@/lib/risk/weights";
import { fixture } from "./fixtures";

describe("risk engine", () => {
  it("ranks Nexus first and the conflicted cheapest supplier last", () => {
    const ranked = rankSuppliers(fixture());
    expect(ranked[0].supplier.id).toBe("SUP-B");
    expect(ranked[ranked.length - 1].supplier.id).toBe("SUP-C");
  });

  it("every dimension cites at least one piece of evidence", () => {
    for (const ev of evaluateAll(fixture())) {
      for (const d of ev.dimensions) {
        expect(d.reasons.length).toBeGreaterThan(0);
      }
    }
  });

  it("maxing the cost weight cannot make the conflicted supplier win", () => {
    const evs = evaluateAll(fixture(), { ...DEFAULT_WEIGHTS, cost: 50 });
    expect(evs[0].supplierId).toBe("SUP-B");
  });

  it("the integrity gate holds even at PURE cost weight (0 on every other dimension)", () => {
    const pureCost = { compliance: 0, delivery: 0, evidence: 0, reliability: 0, cost: 50, compatibility: 0 };
    const evs = evaluateAll(fixture(), pureCost);
    const shenzhen = evs.find((e) => e.supplierId === "SUP-C")!;
    expect(shenzhen.disqualified).toBe(true);
    expect(shenzhen.total).toBeLessThanOrEqual(49);
    expect(shenzhen.rawTotal).toBeGreaterThan(49); // it WOULD win without the gate
    expect(evs[0].supplierId).not.toBe("SUP-C"); // ...but it doesn't
  });

  it("computeTotal normalizes arbitrary weights", () => {
    const scores: Record<DimensionKey, number> = {
      compliance: 100, delivery: 100, evidence: 100, reliability: 100, cost: 100, compatibility: 100,
    };
    expect(computeTotal(scores, { ...DEFAULT_WEIGHTS, compliance: 50 })).toBe(100);
  });
});