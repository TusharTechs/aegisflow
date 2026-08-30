import { appendAudit, getIncident, transitionIncident } from "@/lib/incidents/repository";
import { analyzeIncident } from "@/lib/agents/incident-analyst";
import { runWebIntelligence } from "@/lib/agents/web-intelligence";
import { verifyClaims, corroborationBySupplier } from "@/lib/agents/verification";
import { explainDecision } from "@/lib/agents/decision";
import { rankSuppliers } from "@/lib/suppliers/ranking";

export interface InvestigationStep {
  message: string;
  actor: "SYSTEM" | "AI";
  tag?: "LIVE" | "DEMO SEEDED";
}

const pace = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* runInvestigation(id: string): AsyncGenerator<InvestigationStep> {
  const incident = getIncident(id);
  if (!incident || incident.state !== "INVESTIGATING") return;

  const push = (step: InvestigationStep): InvestigationStep => {
    appendAudit(id, step.message, step.actor);
    return step;
  };

  yield push({ message: "Incident context loaded", actor: "SYSTEM", tag: "LIVE" });
  await pace(300);

  const analyst = await analyzeIncident(incident);
  yield push({ message: `Analyst: ${analyst.summary}`, actor: "AI" });
  await pace(300);

  // ── Web Intelligence (SerpApi, live when configured) ─────────────
  const planned = (await import("@/lib/agents/web-intelligence")).buildQueries(incident);
  yield push({ message: `Searching live web sources… (${planned.length} queries)`, actor: "AI" });
  await pace(400);

  const web = await runWebIntelligence(incident);
  incident.externalSources = web.sources;
  const webTag = web.liveCount > 0 ? "LIVE" : "DEMO SEEDED";
  yield push({
    message: `${web.sources.length} relevant external sources found (${web.liveCount} live · ${web.seededCount} seeded)`,
    actor: "AI",
    tag: webTag,
  });
  await pace(350);

  const corr = corroborationBySupplier(incident);
  const corrSummary = incident.alternativeSuppliers
    .map((s) => `${s.name.split(" ")[0]}: ${corr[s.id] ?? 0}`)
    .join(" · ");
  yield push({ message: `External corroboration — ${corrSummary}`, actor: "AI", tag: webTag });
  await pace(350);

  // ── Document Intelligence (Nutrient lands in Phase 4) ────────────
  yield push({ message: "6 supplier documents identified", actor: "AI", tag: "DEMO SEEDED" });
  await pace(350);
  yield push({ message: "43 fields extracted · 12 material claims identified", actor: "AI", tag: "DEMO SEEDED" });
  await pace(350);

  const report = verifyClaims(incident);
  yield push({
    message: `${report.verified} claims verified · ${report.conflicts} conflicting claims detected`,
    actor: "AI",
    tag: "LIVE",
  });
  await pace(350);

  const ranked = rankSuppliers(incident.alternativeSuppliers);
  for (const r of ranked) {
    const supplier = incident.alternativeSuppliers.find((s) => s.id === r.supplier.id);
    if (!supplier) continue;
    supplier.riskScore = r.score;
    supplier.recommendation = r.rank === 1;
    supplier.recommendationReasoning = r.reasoning;
  }
  yield push({ message: "3 candidate suppliers evaluated", actor: "AI", tag: "LIVE" });
  await pace(350);

  const decision = await explainDecision(incident, ranked, report);
  incident.decision = decision;
  yield push({
    message: `Recommendation prepared: ${ranked[0].supplier.name} (confidence ${decision.confidence}%)`,
    actor: "AI",
  });
  await pace(300);

  transitionIncident(id, "RECOMMENDATION_READY", "AI");
  transitionIncident(id, "HUMAN_REVIEW", "SYSTEM", "Human review required");
  yield { message: "Human review required", actor: "SYSTEM", tag: "LIVE" };
}