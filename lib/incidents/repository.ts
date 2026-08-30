import { DEMO_INCIDENT } from "@/data/demo/pacific-components";
import { Incident, WorkflowStateType } from "@/schemas/core";
import { canTransition } from "@/lib/state/machine";

const globalStore = globalThis as unknown as { __aegisStore?: Map<string, Incident> };

function getStore(): Map<string, Incident> {
  if (!globalStore.__aegisStore) {
    const store = new Map<string, Incident>();
    store.set(DEMO_INCIDENT.id, structuredClone(DEMO_INCIDENT));
    globalStore.__aegisStore = store;
  }
  return globalStore.__aegisStore;
}

export function listIncidents(): Incident[] {
  return [...getStore().values()];
}

export function getIncident(id: string): Incident | undefined {
  return getStore().get(id);
}

export function appendAudit(id: string, event: string, actor: "SYSTEM" | "AI" | "HUMAN") {
  const incident = getStore().get(id);
  if (!incident) return;
  incident.auditLog.push({ timestamp: new Date().toISOString(), event, actor });
}

export function transitionIncident(
  id: string,
  to: WorkflowStateType,
  actor: "SYSTEM" | "AI" | "HUMAN",
  event?: string
) {
  const incident = getStore().get(id);
  if (!incident) throw new Error(`Incident ${id} not found`);
  if (!canTransition(incident.state, to)) {
    throw new Error(`Invalid transition: ${incident.state} -> ${to}`);
  }
  incident.state = to;
  appendAudit(id, event ?? `State transition: ${to}`, actor);
}