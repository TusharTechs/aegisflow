import { DEMO_INCIDENT } from "@/data/demo/pacific-components";
import { Incident, WorkflowStateType } from "@/schemas/core";
import { canTransition, requiresHuman } from "@/lib/state/machine";
import { XanoRepository } from "@/integrations/xano/repository";
import { isXanoConfigured } from "@/integrations/xano/client";

export interface IAegisRepository {
  mode: "LOCAL" | "XANO";
  reset?(): void;
  listIncidents(): Promise<Incident[]>;
  getIncident(id: string): Promise<Incident | undefined>;
  saveIncident(incident: Incident): Promise<void>;
  appendAudit(id: string, event: string, actor: "SYSTEM" | "AI" | "HUMAN"): Promise<void>;
}

const globalStore = globalThis as unknown as { __aegisStore?: Map<string, Incident> };

export class InMemoryRepository implements IAegisRepository {
  mode = "LOCAL" as const;

  reset(): void {
    const store = new Map<string, Incident>();
    store.set(DEMO_INCIDENT.id, structuredClone(DEMO_INCIDENT));
    globalStore.__aegisStore = store;
  }

  private store(): Map<string, Incident> {
    if (!globalStore.__aegisStore) {
      const store = new Map<string, Incident>();
      store.set(DEMO_INCIDENT.id, structuredClone(DEMO_INCIDENT));
      globalStore.__aegisStore = store;
    }
    return globalStore.__aegisStore;
  }

  async listIncidents(): Promise<Incident[]> {
    return [...this.store().values()];
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    return this.store().get(id);
  }

  async saveIncident(incident: Incident): Promise<void> {
    this.store().set(incident.id, incident);
  }

  async appendAudit(id: string, event: string, actor: "SYSTEM" | "AI" | "HUMAN"): Promise<void> {
    const incident = this.store().get(id);
    if (!incident) return;
    incident.auditLog.push({ timestamp: new Date().toISOString(), event, actor });
  }
}

/**
 * Xano is the intended system of record, but the free tier is rate-limited and a
 * half-provisioned schema shouldn't brick the demo. This wrapper writes through to
 * Xano best-effort and keeps an in-memory mirror; the first Xano error (429, a
 * missing field, a network blip) flips it to LOCAL for the rest of the process so
 * every screen stays usable. `/integrations` and the footer show which mode is live.
 */
class ResilientRepository implements IAegisRepository {
  private xano = new XanoRepository();
  private local = new InMemoryRepository();
  private degraded = false;
  degradedReason?: string;

  get mode(): "LOCAL" | "XANO" {
    return this.degraded ? "LOCAL" : "XANO";
  }

  reset(): void {
    this.degraded = false;
    this.degradedReason = undefined;
    this.local.reset();
  }

  private trip(err: unknown) {
    if (!this.degraded) {
      this.degraded = true;
      this.degradedReason = err instanceof Error ? err.message : String(err);
      console.warn(`[aegisflow] Xano unavailable (${this.degradedReason}); serving from in-memory store.`);
    }
  }

  async listIncidents(): Promise<Incident[]> {
    if (this.degraded) return this.local.listIncidents();
    try {
      return await this.xano.listIncidents();
    } catch (err) {
      this.trip(err);
      return this.local.listIncidents();
    }
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    if (!this.degraded) {
      try {
        const fromXano = await this.xano.getIncident(id);
        if (fromXano) {
          await this.local.saveIncident(structuredClone(fromXano));
          return fromXano;
        }
      } catch (err) {
        this.trip(err);
      }
    }
    return this.local.getIncident(id);
  }

  async saveIncident(incident: Incident): Promise<void> {
    await this.local.saveIncident(incident);
    if (this.degraded) return;
    try {
      await this.xano.saveIncident(incident);
    } catch (err) {
      this.trip(err);
    }
  }

  async appendAudit(id: string, event: string, actor: "SYSTEM" | "AI" | "HUMAN"): Promise<void> {
    await this.local.appendAudit(id, event, actor);
    if (this.degraded) return;
    try {
      await this.xano.appendAudit(id, event, actor);
    } catch (err) {
      this.trip(err);
    }
  }
}

let repo: IAegisRepository | undefined;

export function getRepository(): IAegisRepository {
  if (!repo) repo = isXanoConfigured() ? new ResilientRepository() : new InMemoryRepository();
  return repo;
}

export function persistenceMode(): "XANO" | "LOCAL" {
  return getRepository().mode;
}

export function persistenceNote(): string | undefined {
  const r = getRepository();
  return r instanceof ResilientRepository ? r.degradedReason : undefined;
}

export async function listIncidents(): Promise<Incident[]> {
  return getRepository().listIncidents();
}

export async function getIncident(id: string): Promise<Incident | undefined> {
  return getRepository().getIncident(id);
}

export async function saveIncident(incident: Incident): Promise<void> {
  return getRepository().saveIncident(incident);
}

export async function appendAudit(id: string, event: string, actor: "SYSTEM" | "AI" | "HUMAN"): Promise<void> {
  return getRepository().appendAudit(id, event, actor);
}

export async function transitionIncident(
  id: string,
  to: WorkflowStateType,
  actor: "SYSTEM" | "AI" | "HUMAN",
  event?: string
): Promise<void> {
  const repository = getRepository();
  const incident = await repository.getIncident(id);
  if (!incident) throw new Error(`Incident ${id} not found`);
  if (!canTransition(incident.state, to)) {
    throw new Error(`Invalid transition: ${incident.state} -> ${to}`);
  }
  if (requiresHuman(to) && actor !== "HUMAN") {
    throw new Error(`Blocked: ${actor} may not perform the human-only transition -> ${to}`);
  }
  incident.state = to;
  await repository.saveIncident(incident);
  await repository.appendAudit(id, event ?? `State transition: ${to}`, actor);
}

export async function resetRepository(): Promise<void> {
  getRepository().reset?.();
}
