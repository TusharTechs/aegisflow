import { z } from "zod";
import { Incident } from "@/schemas/core";
import { generateStructured } from "@/lib/ai/gemini";
import type { ActivityLedger } from "@/lib/integrations/ledger";

const AnalysisSchema = z.object({
  urgency: z.enum(["CRITICAL", "HIGH", "MODERATE"]),
  summary: z.string(),
});

export interface AnalystOutput {
  summary: string;
  source: "gemini" | "fallback";
}

export async function analyzeIncident(incident: Incident, ledger?: ActivityLedger): Promise<AnalystOutput> {
  const fallbackSummary = `${incident.supplier} disruption puts ${incident.affectedProduct} supply at risk with ${incident.inventoryDays} days of inventory remaining. Immediate alternative sourcing required.`;
  const res = await generateStructured({
    schema: AnalysisSchema,
    fallback: { urgency: "CRITICAL" as const, summary: fallbackSummary },
    ledger,
    operation: "incident-analyst",
    prompt:
      `You are the Incident Analyst agent for AegisFlow. Summarize this procurement disruption in one sentence. ` +
      `Use ONLY these facts: supplier=${incident.supplier}; product=${incident.affectedProduct}; ` +
      `inventoryDays=${incident.inventoryDays}; revenueExposureUSD=${incident.revenueExposure}. ` +
      `Return JSON matching the schema. Do not invent facts.`,
  });
  return { summary: res.value.summary, source: res.source };
}