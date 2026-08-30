import { Supplier } from "@/schemas/core";

export interface RankedSupplier {
  supplier: Supplier;
  rank: number;
  score: number;
  evidenceScore: number;
  deliveryScore: number;
  costScore: number;
  verified: number;
  conflicts: number;
  reasoning: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function rankSuppliers(suppliers: Supplier[]): RankedSupplier[] {
  const ranked = suppliers
    .map((s) => {
      const verified = s.claims.filter((c) => c.status === "VERIFIED").length;
      const conflicts = s.claims.filter((c) => c.status === "CONFLICT").length;
      const unverified = s.claims.filter((c) => c.status === "UNVERIFIED").length;
      const avgConfidence = s.claims.length
        ? s.claims.reduce((a, c) => a + c.confidence, 0) / s.claims.length
        : 0;

      const evidenceScore = clamp(avgConfidence - conflicts * 25 - unverified * 10);
      const deliveryScore =
        s.leadTimeDays <= 3 ? 95 : s.leadTimeDays <= 5 ? 80 : s.leadTimeDays <= 7 ? 70 : s.leadTimeDays <= 14 ? 50 : 30;
      const costScore = clamp(120 - s.costMultiplier * 50);

      const score = clamp(evidenceScore * 0.5 + deliveryScore * 0.3 + costScore * 0.2);
      const reasoning = `${verified} of ${s.claims.length} claims verified · ${s.leadTimeDays}-day lead time · ${
        conflicts > 0 ? `${conflicts} evidence conflict${conflicts > 1 ? "s" : ""} detected` : "no conflicts detected"
      }`;

      return { supplier: s, rank: 0, score, evidenceScore, deliveryScore, costScore, verified, conflicts, reasoning };
    })
    .sort((a, b) => b.score - a.score);

  ranked.forEach((r, i) => (r.rank = i + 1));
  return ranked;
}