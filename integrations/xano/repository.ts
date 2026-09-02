import type { IAegisRepository } from "@/lib/incidents/repository";
import { DEMO_INCIDENT } from "@/data/demo/pacific-components";
import { Claim, Incident, Supplier } from "@/schemas/core";
import { xano } from "./client";

interface IncidentRow {
  id: number; incident_key: string; supplier: string; affected_product: string;
  status: string; inventory_days: number; revenue_exposure: number; state: string;
  evidence_json?: EvidenceJson;
}
interface SupplierRow {
  id: number; incident_id: number; supplier_key: string; name: string; location: string;
  lead_time_days: number; cost_multiplier: number; risk_score: number;
  recommendation: boolean; recommendation_reasoning: string;
}
interface ClaimRow {
  id: number; supplier_id: number; claim_key: string; text: string; source: string; ts: string;
  confidence: number; status: string; conflict_reason: string; document_evidence?: Claim["documentEvidence"];
}
interface AuditRow { incident_id: number; event_ts: string; event: string; actor: string; }

type EvidenceJson =
  | (Partial<
      Pick<
        Incident,
        | "externalSources"
        | "domainFootprints"
        | "documentsProcessed"
        | "apiActivity"
        | "decision"
        | "generatedDocument"
        | "signature"
      >
    > & {
      /**
       * Latest computed verdicts, overlaid onto the normalised rows on read.
       *
       * The `supplier` and `claim` tables hold the entities and are the schema the
       * app is built on. But refreshing them is ~15 requests, and the free tier's
       * 10 req/20s window means some of those always fail — leaving the UI showing
       * verdicts from an older run. This rides along in the single incident-row
       * write, so what a screen displays is always what the last run actually
       * computed, while the paced writes catch the tables up behind it.
       */
      verdicts?: SupplierVerdict[] | null;
      /**
       * The audit stream, carried alongside the evidence.
       *
       * `audit_event` remains the append-only table and is still written. But an
       * investigation emits ~14 events, and one Xano request each exhausts the free
       * tier's 10-per-20s budget — starving the single write that actually carries
       * the run. Riding along here makes the whole result durable in ONE request,
       * with the table filling in behind as budget allows.
       */
      auditLog?: Incident["auditLog"] | null;
    })
  | null;

interface SupplierVerdict {
  supplierKey: string;
  riskScore: number;
  recommendation: boolean;
  recommendationReasoning: string;
  claims: Claim[];
}

function toVerdicts(incident: Incident): SupplierVerdict[] {
  return incident.alternativeSuppliers.map((s) => ({
    supplierKey: s.id,
    riskScore: s.riskScore,
    recommendation: s.recommendation ?? false,
    recommendationReasoning: s.recommendationReasoning ?? "",
    claims: s.claims,
  }));
}

/**
 * Talks to Xano's *default* auto-generated CRUD endpoints only — GET (list),
 * GET/{id}, POST, PATCH/{id}. All row filtering happens here in JS, so setting up
 * Xano is just "add CRUD" on four tables with no endpoint customization. The
 * demo dataset is tiny, so listing and filtering client-side is fine.
 */
const pace = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class XanoRepository implements IAegisRepository {
  mode = "XANO" as const;

  // Short-lived per-instance cache — the free tier is rate-limited, and one page
  // render calls rows("supplier") / rows("claim") several times.
  private cache = new Map<string, { at: number; data: unknown[] }>();
  private seeding: Promise<void> | null = null;

  private async rows<T>(table: string, { fresh = false } = {}): Promise<T[]> {
    const hit = this.cache.get(table);
    if (!fresh && hit && Date.now() - hit.at < 4000) return hit.data as T[];
    const res = await xano.get(`/${table}`);
    const data = (Array.isArray(res) ? res : (res?.items ?? [])) as unknown[];
    // Never cache an empty result. A rate-limited or oddly-shaped response coerces
    // to [] here, and caching that poisons every lookup for the next 4s — including
    // the row lookup a write depends on.
    if (data.length) this.cache.set(table, { at: Date.now(), data });
    return data as T[];
  }

  private invalidate(...tables: string[]) {
    for (const t of tables) this.cache.delete(t);
  }

  async listIncidents(): Promise<Incident[]> {
    const rows = await this.rows<IncidentRow>("incident");
    return Promise.all(rows.map((r) => this.assemble(r)));
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    const incidentRows = await this.rows<IncidentRow>("incident");
    let row = incidentRows.find((r) => r.incident_key === id);
    // Guard: rows exist but none carry `incident_key` → the table is missing its
    // fields. Fail fast (don't seed junk rows on every request).
    if (!row && incidentRows.length > 0 && incidentRows.every((r) => !("incident_key" in r))) {
      throw new Error(
        "Xano `incident` table has no `incident_key` field — add the columns from docs/xano-setup.md, then delete the empty rows."
      );
    }
    if (!row && id === DEMO_INCIDENT.id && process.env.XANO_AUTO_SEED !== "false") {
      // Single-flight: concurrent renders must not both seed.
      this.seeding ??= this.seed().finally(() => { this.seeding = null; });
      await this.seeding;
      this.invalidate("incident", "supplier", "claim", "audit_event");
      row = (await this.rows<IncidentRow>("incident")).find((r) => r.incident_key === id);
      if (!row) {
        throw new Error(
          "Xano seeded but no incident row is readable — check that the `incident` table has an `incident_key` field."
        );
      }
    }
    return row ? this.assemble(row) : undefined;
  }

  /**
   * Write ONLY the incident row: its state and the evidence_json blob that every
   * screen reads back (ledger, sources, documents, footprints, decision).
   *
   * This is deliberately one request. The supplier/claim fan-out in `saveIncident`
   * is ~15 more, which on the free tier's 10 req/20s guarantees a 429 somewhere —
   * and a 429 that lands on *this* row costs the Integration Activity Ledger, the
   * Evidence view and the conflict panel. Retried once, because losing it is the
   * difference between a demo that reloads and one that doesn't.
   */
  async saveIncidentCore(incident: Incident): Promise<void> {
    // Read fresh: this is the write that carries the whole run, and a cached (or
    // transiently empty) row list would turn it into a silent no-op.
    const row = (await this.rows<IncidentRow>("incident", { fresh: true })).find(
      (r) => r.incident_key === incident.id
    );
    // Absence here is a failure, not a nothing-to-do. Returning quietly is how a
    // completed investigation vanished: the caller saw success and moved on.
    if (!row) throw new Error(`Xano has no incident row for ${incident.id} (read returned ${"empty or unmatched"})`);

    const body = {
      state: incident.state,
      status: incident.status,
      evidence_json: {
        verdicts: toVerdicts(incident),
        auditLog: incident.auditLog ?? null,
        externalSources: incident.externalSources ?? null,
        domainFootprints: incident.domainFootprints ?? null,
        documentsProcessed: incident.documentsProcessed ?? null,
        apiActivity: incident.apiActivity ?? null,
        decision: incident.decision ?? null,
        generatedDocument: incident.generatedDocument ?? null,
        signature: incident.signature ?? null,
      },
    };

    try {
      await xano.patch(`/incident/${row.id}`, body);
    } catch (err) {
      if (!/429/.test(err instanceof Error ? err.message : "")) throw err;
      // The free tier's window is 20s; wait it out once rather than lose the row.
      await pace(Number(process.env.XANO_RETRY_DELAY_MS ?? 20_000));
      await xano.patch(`/incident/${row.id}`, body);
    }
  }

  async saveIncident(incident: Incident): Promise<void> {
    const row = (await this.rows<IncidentRow>("incident")).find((r) => r.incident_key === incident.id);
    if (!row) return;

    await xano.patch(`/incident/${row.id}`, {
      state: incident.state,
      status: incident.status,
      evidence_json: {
        verdicts: toVerdicts(incident),
        auditLog: incident.auditLog ?? null,
        externalSources: incident.externalSources ?? null,
        domainFootprints: incident.domainFootprints ?? null,
        documentsProcessed: incident.documentsProcessed ?? null,
        apiActivity: incident.apiActivity ?? null,
        decision: incident.decision ?? null,
        generatedDocument: incident.generatedDocument ?? null,
        signature: incident.signature ?? null,
      },
    });

    // The supplier/claim updates are secondary (the incident row's evidence_json
    // above already holds the full picture). Pace them for the free tier and stop
    // quietly if we hit the limit mid-burst — the caller's queue retries later.
    const step = Number(process.env.XANO_SEED_DELAY_MS ?? 2100);
    try {
      const supplierRows = (await this.rows<SupplierRow>("supplier")).filter((r) => r.incident_id === row.id);
      const claimRows = await this.rows<ClaimRow>("claim");
      for (const s of incident.alternativeSuppliers) {
        const existing = supplierRows.find((r) => r.supplier_key === s.id);
        if (!existing) continue;
        await pace(step);
        await xano.patch(`/supplier/${existing.id}`, {
          risk_score: s.riskScore,
          recommendation: s.recommendation ?? false,
          recommendation_reasoning: s.recommendationReasoning ?? "",
        });

        const supplierClaims = claimRows.filter((r) => r.supplier_id === existing.id);
        for (const c of s.claims) {
          const existingClaim = supplierClaims.find((r) => r.claim_key === c.id);
          const body = {
            confidence: c.confidence,
            status: c.status,
            conflict_reason: c.conflictReason ?? "",
            document_evidence: c.documentEvidence ?? null,
          };
          await pace(step);
          if (existingClaim) {
            await xano.patch(`/claim/${existingClaim.id}`, body);
          } else {
            await xano.post("/claim", {
              supplier_id: existing.id, claim_key: c.id, text: c.text, source: c.source, ts: c.timestamp, ...body,
            });
          }
        }
      }
    } catch (err) {
      if (!(err instanceof Error && /429/.test(err.message))) throw err;
    }
    this.invalidate("supplier", "claim");
  }

  async appendAudit(id: string, event: string, actor: "SYSTEM" | "AI" | "HUMAN"): Promise<void> {
    const row = (await this.rows<IncidentRow>("incident")).find((r) => r.incident_key === id);
    if (!row) return;
    await xano.post("/audit_event", {
      incident_id: row.id,
      event_ts: new Date().toISOString(),
      event,
      actor,
    });
    this.invalidate("audit_event");
  }

  private async assemble(row: IncidentRow): Promise<Incident> {
    const [allSuppliers, allClaims, allAudit] = await Promise.all([
      this.rows<SupplierRow>("supplier"),
      this.rows<ClaimRow>("claim"),
      this.rows<AuditRow>("audit_event"),
    ]);

    const suppliers: Supplier[] = allSuppliers
      .filter((sr) => sr.incident_id === row.id)
      .map((sr) => ({
        id: sr.supplier_key,
        name: sr.name,
        location: sr.location,
        leadTimeDays: sr.lead_time_days,
        costMultiplier: sr.cost_multiplier,
        riskScore: sr.risk_score,
        recommendation: sr.recommendation,
        recommendationReasoning: sr.recommendation_reasoning || undefined,
        claims: allClaims
          .filter((cr) => cr.supplier_id === sr.id)
          .map((cr): Claim => ({
            id: cr.claim_key,
            text: cr.text,
            source: cr.source,
            timestamp: cr.ts,
            confidence: cr.confidence,
            status: cr.status as Claim["status"],
            conflictReason: cr.conflict_reason || undefined,
            documentEvidence: cr.document_evidence ?? undefined,
          })),
      }));

    const ev: NonNullable<EvidenceJson> = row.evidence_json ?? {};

    // Overlay the last computed verdicts onto the normalised rows. Present only
    // when a run has written them; otherwise the tables stand on their own.
    for (const v of ev.verdicts ?? []) {
      const supplier = suppliers.find((s) => s.id === v.supplierKey);
      if (!supplier) continue;
      supplier.riskScore = v.riskScore;
      supplier.recommendation = v.recommendation;
      supplier.recommendationReasoning = v.recommendationReasoning;
      if (v.claims?.length) supplier.claims = v.claims;
    }

    return {
      id: row.incident_key,
      supplier: row.supplier,
      affectedProduct: row.affected_product,
      status: row.status as Incident["status"],
      inventoryDays: row.inventory_days,
      revenueExposure: row.revenue_exposure,
      state: row.state as Incident["state"],
      alternativeSuppliers: suppliers,
      // Prefer the copy written with the evidence; the table is the same stream,
      // just subject to the rate limit.
      auditLog:
        ev.auditLog && ev.auditLog.length
          ? ev.auditLog
          : allAudit
              .filter((a) => a.incident_id === row.id)
              .map((a) => ({ timestamp: a.event_ts, event: a.event, actor: a.actor as "SYSTEM" | "AI" | "HUMAN" }))
              .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      externalSources: ev.externalSources ?? undefined,
      domainFootprints: ev.domainFootprints ?? undefined,
      documentsProcessed: ev.documentsProcessed ?? undefined,
      apiActivity: ev.apiActivity ?? undefined,
      decision: ev.decision ?? undefined,
      generatedDocument: ev.generatedDocument ?? undefined,
      signature: ev.signature ?? undefined,
    };
  }

  private async seed(): Promise<void> {
    // Re-check under the single-flight lock: another request may have just seeded.
    this.invalidate("incident");
    if ((await this.rows<IncidentRow>("incident")).some((r) => r.incident_key === DEMO_INCIDENT.id)) return;

    const d = DEMO_INCIDENT;
    // Free-tier rate limit is 10 requests / 20 seconds. Space writes ~2.2s apart
    // so a one-time runtime seed stays under it (slow, but it only happens once —
    // prefer `node scripts/seed-xano.mjs` + XANO_AUTO_SEED=false).
    const step = Number(process.env.XANO_SEED_DELAY_MS ?? 2200);
    const incidentRow = await xano.post("/incident", {
      incident_key: d.id, supplier: d.supplier, affected_product: d.affectedProduct, status: d.status,
      inventory_days: d.inventoryDays, revenue_exposure: d.revenueExposure, state: d.state, evidence_json: null,
    });
    for (const s of d.alternativeSuppliers) {
      await pace(step);
      const sRow = await xano.post("/supplier", {
        incident_id: incidentRow.id, supplier_key: s.id, name: s.name, location: s.location,
        lead_time_days: s.leadTimeDays, cost_multiplier: s.costMultiplier, risk_score: s.riskScore,
        recommendation: false, recommendation_reasoning: "",
      });
      for (const c of s.claims) {
        await pace(step);
        await xano.post("/claim", {
          supplier_id: sRow.id, claim_key: c.id, text: c.text, source: c.source, ts: c.timestamp,
          confidence: c.confidence, status: c.status, conflict_reason: c.conflictReason ?? "", document_evidence: null,
        });
      }
    }
    await pace(step);
    await xano.post("/audit_event", {
      incident_id: incidentRow.id,
      event_ts: new Date().toISOString(),
      event: "Incident seeded from AegisFlow demo dataset",
      actor: "SYSTEM",
    });
    this.invalidate("incident", "supplier", "claim", "audit_event");
  }
}
