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

type EvidenceJson = Partial<
  Pick<Incident, "externalSources" | "documentsProcessed" | "apiActivity" | "decision" | "generatedDocument" | "signature">
> | null;

/**
 * Talks to Xano's *default* auto-generated CRUD endpoints only — GET (list),
 * GET/{id}, POST, PATCH/{id}. All row filtering happens here in JS, so setting up
 * Xano is just "add CRUD" on four tables with no endpoint customization. The
 * demo dataset is tiny, so listing and filtering client-side is fine.
 */
export class XanoRepository implements IAegisRepository {
  mode = "XANO" as const;

  private async rows<T>(table: string): Promise<T[]> {
    const res = await xano.get(`/${table}`);
    return (Array.isArray(res) ? res : (res?.items ?? [])) as T[];
  }

  async listIncidents(): Promise<Incident[]> {
    const rows = await this.rows<IncidentRow>("incident");
    return Promise.all(rows.map((r) => this.assemble(r)));
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    let row = (await this.rows<IncidentRow>("incident")).find((r) => r.incident_key === id);
    if (!row && id === DEMO_INCIDENT.id && process.env.XANO_AUTO_SEED !== "false") {
      await this.seed();
      row = (await this.rows<IncidentRow>("incident")).find((r) => r.incident_key === id);
    }
    return row ? this.assemble(row) : undefined;
  }

  async saveIncident(incident: Incident): Promise<void> {
    const row = (await this.rows<IncidentRow>("incident")).find((r) => r.incident_key === incident.id);
    if (!row) return;

    await xano.patch(`/incident/${row.id}`, {
      state: incident.state,
      status: incident.status,
      evidence_json: {
        externalSources: incident.externalSources ?? null,
        documentsProcessed: incident.documentsProcessed ?? null,
        apiActivity: incident.apiActivity ?? null,
        decision: incident.decision ?? null,
        generatedDocument: incident.generatedDocument ?? null,
        signature: incident.signature ?? null,
      },
    });

    const supplierRows = (await this.rows<SupplierRow>("supplier")).filter((r) => r.incident_id === row.id);
    const claimRows = await this.rows<ClaimRow>("claim");
    for (const s of incident.alternativeSuppliers) {
      const existing = supplierRows.find((r) => r.supplier_key === s.id);
      if (!existing) continue;
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
        if (existingClaim) {
          await xano.patch(`/claim/${existingClaim.id}`, body);
        } else {
          await xano.post("/claim", {
            supplier_id: existing.id, claim_key: c.id, text: c.text, source: c.source, ts: c.timestamp, ...body,
          });
        }
      }
    }
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

    return {
      id: row.incident_key,
      supplier: row.supplier,
      affectedProduct: row.affected_product,
      status: row.status as Incident["status"],
      inventoryDays: row.inventory_days,
      revenueExposure: row.revenue_exposure,
      state: row.state as Incident["state"],
      alternativeSuppliers: suppliers,
      auditLog: allAudit
        .filter((a) => a.incident_id === row.id)
        .map((a) => ({ timestamp: a.event_ts, event: a.event, actor: a.actor as "SYSTEM" | "AI" | "HUMAN" }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      externalSources: ev.externalSources ?? undefined,
      documentsProcessed: ev.documentsProcessed ?? undefined,
      apiActivity: ev.apiActivity ?? undefined,
      decision: ev.decision ?? undefined,
      generatedDocument: ev.generatedDocument ?? undefined,
      signature: ev.signature ?? undefined,
    };
  }

  private async seed(): Promise<void> {
    const d = DEMO_INCIDENT;
    const incidentRow = await xano.post("/incident", {
      incident_key: d.id, supplier: d.supplier, affected_product: d.affectedProduct, status: d.status,
      inventory_days: d.inventoryDays, revenue_exposure: d.revenueExposure, state: d.state, evidence_json: null,
    });
    for (const s of d.alternativeSuppliers) {
      const sRow = await xano.post("/supplier", {
        incident_id: incidentRow.id, supplier_key: s.id, name: s.name, location: s.location,
        lead_time_days: s.leadTimeDays, cost_multiplier: s.costMultiplier, risk_score: s.riskScore,
        recommendation: false, recommendation_reasoning: "",
      });
      for (const c of s.claims) {
        await xano.post("/claim", {
          supplier_id: sRow.id, claim_key: c.id, text: c.text, source: c.source, ts: c.timestamp,
          confidence: c.confidence, status: c.status, conflict_reason: c.conflictReason ?? "", document_evidence: null,
        });
      }
    }
    await xano.post("/audit_event", {
      incident_id: incidentRow.id,
      event_ts: new Date().toISOString(),
      event: "Incident seeded from AegisFlow demo dataset",
      actor: "SYSTEM",
    });
  }
}
