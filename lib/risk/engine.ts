import { Incident, Supplier } from "@/schemas/core";
import { DEFAULT_WEIGHTS, DimensionKey, RiskWeights, computeTotal, riskLevel } from "./weights";

export interface DimensionScore {
  key: DimensionKey;
  score: number;
  reasons: string[];
}

export interface RiskEvaluation {
  supplierId: string;
  supplierName: string;
  scores: Record<DimensionKey, number>;
  dimensions: DimensionScore[];
  total: number;
  level: "LOW" | "MEDIUM" | "HIGH";
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function externalCount(incident: Incident, supplierId: string): number {
  return (incident.externalSources ?? []).filter((s) => s.supplierId === supplierId && s.relevance >= 60).length;
}

export function evaluateSupplier(supplier: Supplier, incident: Incident, weights: RiskWeights = DEFAULT_WEIGHTS): RiskEvaluation {
  const dims: DimensionScore[] = [];
  const docs = incident.documentsProcessed ?? [];
  const sources = incident.externalSources ?? [];

  // ── Compliance ────────────────────────────────────────────────
  const iso = supplier.claims.find((c) => c.text.toLowerCase().includes("iso"));
  const specDoc = docs.find((d) => d.supplierId === supplier.id && d.type === "Product Specification");
  if (iso?.status === "VERIFIED" && iso.documentEvidence) {
    dims.push({ key: "compliance", score: iso.confidence, reasons: [
      `ISO certificate document processed (${iso.documentEvidence.documentId})`,
      `Claim confidence ${iso.confidence}% from document extraction`,
    ]});
  } else if (iso && (iso.status === "UNVERIFIED" || iso.status === "CONFLICT")) {
    dims.push({ key: "compliance", score: clamp(iso.confidence * 0.6), reasons: [
      iso.conflictReason ?? "ISO claim could not be independently verified",
      "Certificate issuer not accredited",
    ]});
  } else if (specDoc) {
    dims.push({ key: "compliance", score: 70, reasons: [
      `CE/RoHS stated in ${specDoc.id}`,
      "No ISO 9001 certificate on file",
    ]});
  } else {
    dims.push({ key: "compliance", score: 50, reasons: ["No compliance documentation available"] });
  }

  // ── Delivery ──────────────────────────────────────────────────
  const deliveryClaim = supplier.claims.find((c) => c.status === "VERIFIED" && /day|shipping|lead/i.test(c.text));
  let delivery = supplier.leadTimeDays <= 3 ? 90 : supplier.leadTimeDays <= 5 ? 75 : supplier.leadTimeDays <= 7 ? 65 : supplier.leadTimeDays <= 14 ? 50 : 35;
  const deliveryReasons = [`Quoted lead time: ${supplier.leadTimeDays} days`];
  if (deliveryClaim) {
    delivery = clamp(delivery + 5);
    deliveryReasons.push(`Delivery claim verified at ${deliveryClaim.confidence}% (${deliveryClaim.source})`);
  }
  dims.push({ key: "delivery", score: delivery, reasons: deliveryReasons });

  // ── Evidence confidence ───────────────────────────────────────
  const verified = supplier.claims.filter((c) => c.status === "VERIFIED");
  const conflicts = supplier.claims.filter((c) => c.status === "CONFLICT").length;
  const unverified = supplier.claims.filter((c) => c.status === "UNVERIFIED").length;
  const avg = supplier.claims.length ? supplier.claims.reduce((a, c) => a + c.confidence, 0) / supplier.claims.length : 0;
  dims.push({ key: "evidence", score: clamp(avg - conflicts * 25 - unverified * 10), reasons: [
    `${verified.length} of ${supplier.claims.length} claims verified`,
    conflicts > 0 ? `${conflicts} evidence conflict(s) detected` : "No conflicts detected",
    `${externalCount(incident, supplier.id)} corroborating external source(s)`,
  ]});

  // ── Supplier reliability ──────────────────────────────────────
  const conflictClaim = supplier.claims.find((c) => c.status === "CONFLICT");
  const regClaim = supplier.claims.find((c) => /registered entity since/i.test(c.text));
  const regDoc = docs.find((d) => d.supplierId === supplier.id && d.type === "Business Registration");
  const ext = externalCount(incident, supplier.id);
  if (conflictClaim) {
    dims.push({ key: "reliability", score: 40, reasons: [
      conflictClaim.conflictReason ?? "Identity claims contradict registration records",
      "Conflicting public statements reduce trust",
    ]});
  } else {
    const yearMatch = regClaim?.text.match(/(\d{4})/);
    const years = yearMatch ? new Date().getFullYear() - parseInt(yearMatch[1], 10) : 0;
    dims.push({
      key: "reliability",
      score: clamp(65 + Math.min(9, ext * 3) + (years >= 8 ? 10 : years >= 4 ? 5 : 0) + (regDoc ? 5 : 0)),
      reasons: [
        regClaim?.text ?? "No registration claim on file",
        `${ext} external corroborating source(s)`,
        regDoc ? `Registration document processed (${regDoc.id})` : "No registration document on file",
      ],
    });
  }

  // ── Cost ──────────────────────────────────────────────────────
  dims.push({ key: "cost", score: clamp(120 - supplier.costMultiplier * 50), reasons: [
    `Cost multiplier ${supplier.costMultiplier.toFixed(2)}× vs incumbent baseline`,
  ]});

  // ── Product compatibility ─────────────────────────────────────
  const compatDoc = docs.find((d) => d.supplierId === supplier.id && d.type === "Product Specification");
  const firstName = supplier.name.split(" ")[0];
  const crossRef = sources.find((s) =>
    (s.title + s.snippet).toLowerCase().includes(firstName.toLowerCase()) &&
    /equivalent|cross-reference/i.test(s.title + s.snippet)
  );
  if (compatDoc) {
    dims.push({ key: "compatibility", score: 95, reasons: [`Product specification confirms equivalence (${compatDoc.id})`] });
  } else if (crossRef) {
    dims.push({ key: "compatibility", score: 85, reasons: [`Listed as qualified equivalent in external cross-reference (${crossRef.url})`] });
  } else {
    dims.push({ key: "compatibility", score: 35, reasons: ["No compatibility evidence found"] });
  }

  const scores = Object.fromEntries(dims.map((d) => [d.key, d.score])) as Record<DimensionKey, number>;
  const total = computeTotal(scores, weights);
  return { supplierId: supplier.id, supplierName: supplier.name, scores, dimensions: dims, total, level: riskLevel(total) };
}

export function evaluateAll(incident: Incident, weights: RiskWeights = DEFAULT_WEIGHTS): RiskEvaluation[] {
  return incident.alternativeSuppliers
    .map((s) => evaluateSupplier(s, incident, weights))
    .sort((a, b) => b.total - a.total);
}