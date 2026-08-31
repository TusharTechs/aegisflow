import { z } from "zod";
import { Incident } from "@/schemas/core";
import { RankedSupplier } from "@/lib/suppliers/ranking";
import { VerificationReport } from "@/lib/agents/verification";
import { generateStructured } from "@/lib/ai/gemini";
import type { ActivityLedger } from "@/lib/integrations/ledger";

export interface Decision {
  recommendedSupplierId: string;
  confidence: number;
  reasoning: string;
  risks: string[];
  unknowns: string[];
  source: "gemini" | "fallback";
}

const Schema = z.object({
  reasoning: z.string().min(1),
  risks: z.array(z.string()).max(6).default([]),
  unknowns: z.array(z.string()).max(6).default([]),
});

export async function explainDecision(
  incident: Incident,
  ranked: RankedSupplier[],
  report: VerificationReport,
  ledger?: ActivityLedger
): Promise<Decision> {
  const top = ranked[0];
  const worst = ranked[ranked.length - 1];
  const confidence = Math.round(top.score * 0.5 + top.evidenceScore * 0.5);

  const fallback = {
    reasoning:
      `${top.reasoning}. ${top.supplier.name} leads on delivery evidence and claim confidence. ` +
      `${worst.supplier.name} was not recommended despite lower cost due to unresolved evidence conflicts.`,
    risks: report.flagged.map((f) => `${f.claim.text} — ${f.claim.conflictReason ?? "unverified"}`).slice(0, 4),
    unknowns: ["Live certification registry check pending", "Customer order impact assessment pending"],
  };

  const facts = ranked.map((r) => ({
    supplier: r.supplier.name,
    score: r.score,
    leadTimeDays: r.supplier.leadTimeDays,
    costMultiplier: r.supplier.costMultiplier,
    verifiedClaims: r.verified,
    conflicts: r.conflicts,
  }));

  const res = await generateStructured({
    schema: Schema,
    fallback,
    ledger,
    operation: "decision-agent",
    prompt:
      `You are the Decision agent for AegisFlow. The deterministic risk model ranked ${top.supplier.name} first ` +
      `for incident ${incident.id} (${incident.affectedProduct}). Facts: ${JSON.stringify(facts)}. ` +
      `Return a JSON object with exactly these keys: "reasoning" (a 2-3 sentence string explaining the pick), ` +
      `"risks" (array of short strings, from the facts only), "unknowns" (array of short strings). ` +
      `Do not invent facts.`,
  });

  return {
    recommendedSupplierId: top.supplier.id,
    confidence,
    reasoning: res.value.reasoning || fallback.reasoning,
    risks: res.value.risks.length ? res.value.risks : fallback.risks,
    unknowns: res.value.unknowns.length ? res.value.unknowns : fallback.unknowns,
    source: res.source,
  };
}