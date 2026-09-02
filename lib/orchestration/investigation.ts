import {
  flushWrites,
  getIncident,
  persistenceNote,
  saveIncidentCore,
  transitionIncident,
} from "@/lib/incidents/repository";
import { isXanoConfigured } from "@/integrations/xano/client";
import { analyzeIncident } from "@/lib/agents/incident-analyst";
import { runWebIntelligence, buildQueries } from "@/lib/agents/web-intelligence";
import { runDomainIntelligence } from "@/lib/agents/domain-intelligence";
import { runDocumentIntelligence, mergeDocClaims } from "@/lib/agents/document-intelligence";
import { verifyClaims, corroborationBySupplier } from "@/lib/agents/verification";
import { explainDecision } from "@/lib/agents/decision";
import { rankSuppliers } from "@/lib/suppliers/ranking";
import { ActivityLedger } from "@/lib/integrations/ledger";

export interface InvestigationStep {
  message: string;
  actor: "SYSTEM" | "AI";
  tag?: "LIVE" | "DEMO SEEDED" | "LOCAL";
}

const pace = (ms: number) =>
  process.env.VITEST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

export async function* runInvestigation(id: string): AsyncGenerator<InvestigationStep> {
  const incident = await getIncident(id);
  if (!incident || incident.state !== "INVESTIGATING") return;

  const ledger = new ActivityLedger();
  incident.apiActivity = [];

  /**
   * Record a step in the audit stream, in memory.
   *
   * Deliberately not a Xano write. A run emits ~14 steps, and a row each blows
   * straight through the free tier's 10-requests-per-20-seconds budget — starving
   * the one write that carries the whole run, which then fails and leaves the
   * investigation looking like it never happened. The stream is persisted with the
   * evidence in a single request at the end; the append-only `audit_event` table
   * still receives the human authorization events, which are the ones that matter
   * for an audit trail.
   */
  const push = async (step: InvestigationStep): Promise<InvestigationStep> => {
    incident.auditLog.push({
      timestamp: new Date().toISOString(),
      event: step.message,
      actor: step.actor,
    });
    return step;
  };

  yield await push({ message: "Incident context loaded", actor: "SYSTEM", tag: "LIVE" });
  await pace(300);

  const analyst = await analyzeIncident(incident, ledger);
  yield await push({ message: `Analyst: ${analyst.summary}`, actor: "AI" });
  await pace(300);

  const planned = buildQueries(incident);
  yield await push({ message: `Searching live web sources… (${planned.length} queries)`, actor: "AI" });
  await pace(400);

  const web = await runWebIntelligence(incident, ledger);
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

  const domains = await runDomainIntelligence(incident, ledger);
  incident.domainFootprints = domains.footprints;
  const missing = domains.footprints.filter((f) => f.signal === "NO_FOOTPRINT");
  yield await push({
    message:
      `Supplier domain footprint checked — ` +
      (missing.length
        ? `${missing.length} of ${domains.footprints.length} have no registered domain (${missing.map((m) => m.domain).join(", ")})`
        : `all ${domains.footprints.length} registered`),
    actor: "AI",
    tag: domains.liveCount > 0 ? "LIVE" : "DEMO SEEDED",
  });
  await pace(350);

  yield await push({ message: "Processing 6 supplier documents…", actor: "AI" });
  await pace(400);

  const docs = await runDocumentIntelligence(ledger, { affectedProduct: incident.affectedProduct });
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

  const ranked = rankSuppliers(incident);
  for (const r of ranked) {
    const supplier = incident.alternativeSuppliers.find((s) => s.id === r.supplier.id);
    if (!supplier) continue;
    supplier.riskScore = r.score;
    supplier.recommendation = r.rank === 1;
    supplier.recommendationReasoning = r.reasoning;
  }
  yield await push({ message: "3 candidate suppliers evaluated", actor: "AI", tag: "LIVE" });
  await pace(350);

  const decision = await explainDecision(incident, ranked, report, ledger);
  incident.decision = decision;
  yield await push({
    message: `Recommendation prepared: ${ranked[0].supplier.name} (confidence ${decision.confidence}%)`,
    actor: "AI",
  });
  await pace(300);

  const persistStart = Date.now();
  incident.apiActivity = ledger.all();
  // Write for real BEFORE describing it. persistenceMode() reports the read path's
  // current opinion, which a transient 429 can flip to LOCAL even though the direct
  // write lands — and claiming LOCAL for rows that are demonstrably in Xano is the
  // one kind of inaccuracy this ledger exists to prevent.
  const xanoConfigured = isXanoConfigured();
  const xanoLive = xanoConfigured && (await saveIncidentCore(incident));
  const xanoDegraded = persistenceNote();
  ledger.record({
    sponsor: "Xano",
    operation: "persist incident + suppliers + claims + audit",
    method: xanoConfigured ? "PATCH/POST" : "n/a",
    endpoint: xanoConfigured ? `${process.env.XANO_API_BASE ?? ""}/{incident,supplier,claim,audit_event}` : "in-memory store",
    request: {
      incident_key: incident.id,
      state: incident.state,
      suppliers: incident.alternativeSuppliers.length,
      claims: incident.alternativeSuppliers.reduce((a, s) => a + s.claims.length, 0),
      audit_events: incident.auditLog.length,
    },
    response: { mode: xanoLive ? "XANO" : "LOCAL", tables: ["incident", "supplier", "claim", "audit_event"] },
    mode: xanoLive ? "LIVE" : "LOCAL",
    status: xanoLive ? "ok" : "fallback",
    ms: Date.now() - persistStart,
    note: xanoLive
      ? "Normalized rows written to Xano; audit_event stream is append-only."
      : xanoDegraded
        ? `Xano configured but unreachable this run (${xanoDegraded}) — mirrored to the in-memory system of record. Free-tier rate limits are common; retry or check the table schema.`
        : "XANO_API_BASE not configured — normalized rows held in the in-memory system of record. Set Xano env to persist.",
  });
  incident.apiActivity = ledger.all();
  yield await push({
    message: `Integration ledger: ${ledger.all().length} sponsor API calls recorded (${ledger.all().filter((c) => c.mode === "LIVE").length} live)`,
    actor: "SYSTEM",
    tag: "LIVE",
  });
  await pace(200);

  // Both hops are legal and both are recorded; they run against the in-memory
  // mirror, and the single core save below is what makes them durable.
  await transitionIncident(id, "RECOMMENDATION_READY", "AI");
  await transitionIncident(id, "HUMAN_REVIEW", "SYSTEM", "Human review required");

  // Serverless stops executing the moment the stream closes, so anything still
  // queued is lost. The evidence payload goes down the direct path — one request,
  // retried — because it is what every screen reads back on reload. Audit rows
  // drain best-effort behind it.
  incident.state = "HUMAN_REVIEW";
  // Second direct write: the first one predates the Xano ledger row and the two
  // state transitions above.
  const persisted = await saveIncidentCore(incident);
  await flushWrites(persisted ? 4000 : 1000);

  yield { message: "Human review required", actor: "SYSTEM", tag: "LIVE" };
}