import { appendAudit, getIncident, saveIncident, transitionIncident } from "@/lib/incidents/repository";
import { analyzeIncident } from "@/lib/agents/incident-analyst";
import { runWebIntelligence, buildQueries } from "@/lib/agents/web-intelligence";
import { runDocumentIntelligence, mergeDocClaims } from "@/lib/agents/document-intelligence";
import { verifyClaims, corroborationBySupplier } from "@/lib/agents/verification";
import { explainDecision } from "@/lib/agents/decision";
import { rankSuppliers } from "@/lib/suppliers/ranking";

export interface InvestigationStep {
  message: string;
  actor: "SYSTEM" | "AI";
  tag?: "LIVE" | "DEMO SEEDED" | "LOCAL";
}

const pace = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* runInvestigation(id: string): AsyncGenerator<InvestigationStep> {
  const incident = await getIncident(id);
  if (!incident || incident.state !== "INVESTIGATING") return;

  const push = async (step: InvestigationStep): Promise<InvestigationStep> => {
    await appendAudit(id, step.message, step.actor);
    return step;
  };

  yield await push({ message: "Incident context loaded", actor: "SYSTEM", tag: "LIVE" });
  await pace(300);

  const analyst = await analyzeIncident(incident);
  yield await push({ message: `Analyst: ${analyst.summary}`, actor: "AI" });
  await pace(300);

  const planned = buildQueries(incident);
  yield await push({ message: `Searching live web sources… (${planned.length} queries)`, actor: "AI" });
  await pace(400);

  const web = await runWebIntelligence(incident);
  incident.externalSources = web.sources;
  const webTag = web.liveCount > 0 ? "LIVE" : "DEMO SEEDED";
  yield await push({
    message: `${web.sources.length} relevant external sources found (${web.liveCount} live · ${web.seededCount} seeded)`,
    actor: "AI",
    tag: webTag,
  });
  await pace(350);

  const corr = corroborationBySupplier(incident);
  yield await push({
    message: `External corroboration — ${incident.alternativeSuppliers.map((s) => `${s.name.split(" ")[0]}: ${corr[s.id] ?? 0}`).join(" · ")}`,
    actor: "AI",
    tag: webTag,
  });
  await pace(350);

  yield await push({ message: "Processing 6 supplier documents…", actor: "AI" });
  await pace(400);

  const docs = await runDocumentIntelligence();
  mergeDocClaims(incident, docs);
  const docTag = docs.liveCount > 0 ? "LIVE" : "LOCAL";
  yield await push({
    message: `${docs.documents.length} documents processed (${docs.liveCount} via Nutrient · ${docs.documents.length - docs.liveCount} local extraction)`,
    actor: "AI",
    tag: docTag,
  });
  await pace(350);
  yield await push({
    message: `${docs.totalFields} fields extracted · ${docs.claims.length} material claims identified from documents`,
    actor: "AI",
    tag: docTag,
  });
  await pace(350);

  const report = verifyClaims(incident);
  yield await push({
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
  yield await push({ message: "3 candidate suppliers evaluated", actor: "AI", tag: "LIVE" });
  await pace(350);

  const decision = await explainDecision(incident, ranked, report);
  incident.decision = decision;
  yield await push({
    message: `Recommendation prepared: ${ranked[0].supplier.name} (confidence ${decision.confidence}%)`,
    actor: "AI",
  });
  await pace(300);

  await saveIncident(incident);
  await transitionIncident(id, "RECOMMENDATION_READY", "AI");
  await transitionIncident(id, "HUMAN_REVIEW", "SYSTEM", "Human review required");
  yield { message: "Human review required", actor: "SYSTEM", tag: "LIVE" };
}