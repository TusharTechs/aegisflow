import type { IAegisRepository } from "@/lib/incidents/repository";
import { DEMO_INCIDENT } from "@/data/demo/pacific-components";
import { Claim, Incident, Supplier } from "@/schemas/core";
import { xano } from "./client";

interface IncidentRow {
  id: number; incident_key: string; supplier: string; affected_product: string;
  status: string; inventory_days: number; revenue_exposure: number; state: string; evidence_json?: any;
}
interface SupplierRow {
  id: number; incident_id: number; supplier_key: string; name: string; location: string;
  lead_time_days: number; cost_multiplier: number; risk_score: number;
  recommendation: boolean; recommendation_reasoning: string;
}
interface ClaimRow {
  id: number; supplier_id: number; claim_key: string; text: string; source: string; ts: string;
  confidence: number; status: string; conflict_reason: string; document_evidence?: any;
}
interface AuditRow { incident_id: number; event_ts: string; event: string; actor: string; }

export class XanoRepository implements IAegisRepository {
  mode = "XANO" as const;

  async listIncidents(): Promise<Incident[]> {
    const rows = (await xano.get("/incident")) as IncidentRow[];
    return Promise.all(rows.map((r) => this.assemble(r)));
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    let rows = (await xano.get("/incident", { incident_key: id })) as IncidentRow[];
    if (rows.length === 0 && id === DEMO_INCIDENT.id && process.env.XANO_AUTO_SEED !== "false") {
      await this.seed();
      rows = (await xano.get("/incident", { incident_key: id })) as IncidentRow[];
    }
    if (rows.length === 0) return undefined;
    return this.assemble(rows[0]);
  }

  async saveIncident(incident: Incident): Promise<void> {
    const rows = (await xano.get("/incident", { incident_key: incident.id })) as IncidentRow[];
    if (rows.length === 0) return;
    const row = rows[0];

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

    const supplierRows = (await xano.get("/supplier", { incident_id: String(row.id) })) as SupplierRow[];
    for (const s of incident.alternativeSuppliers) {
      const existing = supplierRows.find((r) => r.supplier_key === s.id);
      if (!existing) continue;
      await xano.patch(`/supplier/${existing.id}`, {
        risk_score: s.riskScore,
        recommendation: s.recommendation ?? false,
        recommendation_reasoning: s.recommendationReasoning ?? "",
      });

      const claimRows = (await xano.get("/claim", { supplier_id: String(existing.id) })) as ClaimRow[];
      for (const c of s.claims) {
        const existingClaim = claimRows.find((r) => r.claim_key === c.id);
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
    const rows = (await xano.get("/incident", { incident_key: id })) as IncidentRow[];
    if (rows.length === 0) return;
    await xano.post("/audit_event", {
      incident_id: rows[0].id,
      event_ts: new Date().toISOString(),
      event,
      actor,
    });
  }

  private async assemble(row: IncidentRow): Promise<Incident> {
    const supplierRows = (await xano.get("/supplier", { incident_id: String(row.id) })) as SupplierRow[];
    const suppliers: Supplier[] = [];
    for (const sr of supplierRows) {
      const claimRows = (await xano.get("/claim", { supplier_id: String(sr.id) })) as ClaimRow[];
      suppliers.push({
        id: sr.supplier_key,
        name: sr.name,
        location: sr.location,
        leadTimeDays: sr.lead_time_days,
        costMultiplier: sr.cost_multiplier,
        riskScore: sr.risk_score,
        recommendation: sr.recommendation,
        recommendationReasoning: sr.recommendation_reasoning || undefined,
        claims: claimRows.map((cr): Claim => ({
          id: cr.claim_key,
          text: cr.text,
          source: cr.source,
          timestamp: cr.ts,
          confidence: cr.confidence,
          status: cr.status as Claim["status"],
          conflictReason: cr.conflict_reason || undefined,
          documentEvidence: cr.document_evidence ?? undefined,
        })),
      });
    }

    const auditRows = (await xano.get("/audit_event", { incident_id: String(row.id) })) as AuditRow[];
    const ev = row.evidence_json ?? {};

    return {
      id: row.incident_key,
      supplier: row.supplier,
      affectedProduct: row.affected_product,
      status: row.status as Incident["status"],
      inventoryDays: row.inventory_days,
      revenueExposure: row.revenue_exposure,
      state: row.state as Incident["state"],
      alternativeSuppliers: suppliers,
      auditLog: auditRows
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