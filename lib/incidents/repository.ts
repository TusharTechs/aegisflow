import { DEMO_INCIDENT } from "@/data/demo/pacific-components";
import { Incident, WorkflowStateType } from "@/schemas/core";
import { canTransition } from "@/lib/state/machine";
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

let repo: IAegisRepository | undefined;

export function getRepository(): IAegisRepository {
  if (!repo) repo = isXanoConfigured() ? new XanoRepository() : new InMemoryRepository();
  return repo;
}

export function persistenceMode(): "XANO" | "LOCAL" {
  return getRepository().mode;
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
  incident.state = to;
  await repository.saveIncident(incident);
  await repository.appendAudit(id, event ?? `State transition: ${to}`, actor);
}

export async function resetRepository(): Promise<void> {
  getRepository().reset?.();
}