"use server";

import { revalidatePath } from "next/cache";
import { appendAudit, getIncident, transitionIncident } from "@/lib/incidents/repository";
import { rankSuppliers } from "@/lib/suppliers/ranking";

export async function runResponse(id: string) {
  const incident = getIncident(id);
  if (!incident || incident.state !== "INVESTIGATING") return;

  // Phase 1: simulated investigation steps. Phase 2 replaces this with real
  // agent orchestration (Gemini + SerpApi + Nutrient) streamed to the UI.
  appendAudit(id, "Incident context loaded", "SYSTEM");
  appendAudit(id, "6 supplier documents identified", "AI");
  appendAudit(id, "43 fields extracted · 12 material claims identified", "AI");
  appendAudit(id, "17 relevant external sources found", "AI");
  appendAudit(id, "9 claims verified · 2 conflicting claims detected", "AI");
  appendAudit(id, "3 candidate suppliers evaluated", "AI");

  const ranked = rankSuppliers(incident.alternativeSuppliers);
  for (const r of ranked) {
    const supplier = incident.alternativeSuppliers.find((s) => s.id === r.supplier.id);
    if (!supplier) continue;
    supplier.riskScore = r.score;
    supplier.recommendation = r.rank === 1;
    supplier.recommendationReasoning = r.reasoning;
  }

  transitionIncident(id, "RECOMMENDATION_READY", "AI", `Recommendation prepared: ${ranked[0].supplier.name}`);
  transitionIncident(id, "HUMAN_REVIEW", "SYSTEM", "Human review required");
  revalidatePath(`/incidents/${id}`);
}

export async function approve(id: string) {
  try {
    const incident = getIncident(id);
    if (!incident) return;
    const recommended = incident.alternativeSuppliers.find((s) => s.recommendation)?.name ?? "recommended supplier";
    transitionIncident(id, "APPROVED", "HUMAN", `Human approved transition to ${recommended}`);
    revalidatePath(`/incidents/${id}`);
  } catch {}
}

export async function requestEvidence(id: string) {
  try {
    transitionIncident(id, "INVESTIGATING", "HUMAN", "Human requested additional evidence");
    revalidatePath(`/incidents/${id}`);
  } catch {}
}

export async function reject(id: string) {
  try {
    transitionIncident(id, "REJECTED", "HUMAN", "Human rejected the recommendation");
    revalidatePath(`/incidents/${id}`);
  } catch {}
}