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

  it("computeTotal normalizes arbitrary weights", () => {
    const scores: Record<DimensionKey, number> = {
      compliance: 100, delivery: 100, evidence: 100, reliability: 100, cost: 100, compatibility: 100,
    };
    expect(computeTotal(scores, { ...DEFAULT_WEIGHTS, compliance: 50 })).toBe(100);
  });
});