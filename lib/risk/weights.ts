export const DIMENSIONS = ["compliance", "delivery", "evidence", "reliability", "cost", "compatibility"] as const;
export type DimensionKey = (typeof DIMENSIONS)[number];
export type RiskWeights = Record<DimensionKey, number>;

export const DEFAULT_WEIGHTS: RiskWeights = {
  compliance: 25,
  delivery: 20,
  evidence: 20,
  reliability: 15,
  cost: 10,
  compatibility: 10,
};

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  compliance: "Compliance",
  delivery: "Delivery",
  evidence: "Evidence confidence",
  reliability: "Supplier reliability",
  cost: "Cost competitiveness",
  compatibility: "Product compatibility",
};

export function computeTotal(scores: Record<DimensionKey, number>, weights: RiskWeights): number {
  const sum = DIMENSIONS.reduce((a, k) => a + weights[k], 0) || 1;
  return Math.round(DIMENSIONS.reduce((a, k) => a + scores[k] * (weights[k] / sum), 0));
}

/**
 * Integrity gate. A supplier with an unresolved evidence CONFLICT — contradicted
 * identity claims, a certificate with no registry match — cannot be recommended at
 * any weighting. Its score is capped into the HIGH-risk band. This is what makes
 * "even maxing the cost weight can't make the conflicted supplier win" a guarantee
 * rather than a coincidence of the default weights.
 */
export const INTEGRITY_CAP = 49;

export function applyIntegrityCap(total: number, hasUnresolvedConflict: boolean): number {
  return hasUnresolvedConflict ? Math.min(total, INTEGRITY_CAP) : total;
}

/** Weighted total with the integrity gate applied — use this for any ranking. */
export function scoreWithGate(
  scores: Record<DimensionKey, number>,
  weights: RiskWeights,
  hasUnresolvedConflict: boolean
): number {
  return applyIntegrityCap(computeTotal(scores, weights), hasUnresolvedConflict);
}

export function riskLevel(total: number): "LOW" | "MEDIUM" | "HIGH" {
  return total >= 80 ? "LOW" : total >= 60 ? "MEDIUM" : "HIGH";
}