import { Incident, Supplier } from "@/schemas/core";
import { evaluateAll, RiskEvaluation } from "@/lib/risk/engine";

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
  evaluation: RiskEvaluation;
}

export function rankSuppliers(incident: Incident): RankedSupplier[] {
  const evaluations = evaluateAll(incident);
  const ranked = evaluations.map((ev) => {
    const supplier = incident.alternativeSuppliers.find((s) => s.id === ev.supplierId)!;
    const verified = supplier.claims.filter((c) => c.status === "VERIFIED").length;
    const conflicts = supplier.claims.filter((c) => c.status === "CONFLICT").length;
    const strongest = [...ev.dimensions].sort((a, b) => b.score - a.score).slice(0, 2);
    const reasoning =
      `${strongest.map((d) => d.reasons[0]).join("; ")}. ` +
      (conflicts > 0 ? `${conflicts} evidence conflict(s) detected.` : "No evidence conflicts detected.");
    return {
      supplier,
      rank: 0,
      score: ev.total,
      evidenceScore: ev.scores.evidence,
      deliveryScore: ev.scores.delivery,
      costScore: ev.scores.cost,
      verified,
      conflicts,
      reasoning,
      evaluation: ev,
    };
  });
  ranked.forEach((r, i) => (r.rank = i + 1));
  return ranked;
}