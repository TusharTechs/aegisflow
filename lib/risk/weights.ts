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

export function riskLevel(total: number): "LOW" | "MEDIUM" | "HIGH" {
  return total >= 80 ? "LOW" : total >= 60 ? "MEDIUM" : "HIGH";
}