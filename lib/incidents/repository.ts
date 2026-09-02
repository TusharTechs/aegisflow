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
  private hardDegraded = false; // schema/network error — stays down until restart
  private coolingUntil = 0; // transient 429 — back off briefly, then retry
  /**
   * When each incident was last read from Xano.
   *
   * This used to be a Set with no expiry — read once, then serve the mirror for the
   * life of the process. That is right for one long-lived server and wrong for
   * serverless: the investigation runs in one instance and writes to Xano, while a
   * different warm instance renders the page from a mirror it hydrated before the
   * run and never refreshes. The run completes, the rows land, and the page still
   * shows the old state. A TTL bounds that to a few seconds without putting a Xano
   * read on every render.
   */
  private hydrated = new Map<string, number>();
  private readonly hydrationTtlMs = Number(process.env.XANO_HYDRATION_TTL_MS ?? 5000);
  private writeQueue: Array<{ kind: "save" | "audit"; run: () => Promise<void> }> = [];
  private draining: Promise<void> | null = null;
  degradedReason?: string;

  private get down(): boolean {
    return this.hardDegraded || Date.now() < this.coolingUntil;
  }

  get mode(): "LOCAL" | "XANO" {
    return this.down ? "LOCAL" : "XANO";
  }

  reset(): void {
    this.hardDegraded = false;
    this.coolingUntil = 0;
    this.degradedReason = undefined;
    this.writeQueue = [];
    this.local.reset();
    // Keep everything marked hydrated so we serve the fresh local copy instead of
    // re-pulling stale state, and push the reset state back to Xano in the background.
    this.hydrated = new Map([[DEMO_INCIDENT.id, Date.now()]]);
    const fresh = structuredClone(DEMO_INCIDENT);
    this.enqueueWrite("save", () => this.xano.saveIncident(fresh));
  }

  private trip(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    this.degradedReason = msg;
    if (/429|rate limit/i.test(msg)) {
      // Transient — serve the mirror for ~20s, then let reads try Xano again.
      this.coolingUntil = Date.now() + 20_000;
    } else if (!this.hardDegraded) {
      this.hardDegraded = true;
      console.warn(`[aegisflow] Xano read failed (${msg}); serving from in-memory store.`);
    }
  }

  /**
   * Xano writes go through a paced background queue (free tier: 10 req / 20s).
   * The in-memory mirror is authoritative for the session, so a slow or failing
   * write never blocks a request or degrades read mode — it just retries later.
   */
  private enqueueWrite(kind: "save" | "audit", run: () => Promise<void>) {
    if (this.down) return;
    // Coalesce redundant full-incident saves — only the latest state matters.
    if (kind === "save") this.writeQueue = this.writeQueue.filter((t) => t.kind !== "save");
    this.writeQueue.push({ kind, run });
    void this.drain();
  }

  private drain(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = (async () => {
      try {
        while (this.writeQueue.length) {
          const task = this.writeQueue.shift()!;
          try {
            await task.run();
          } catch (err) {
            console.warn(`[aegisflow] Xano write deferred (${err instanceof Error ? err.message : "error"}).`);
          }
          if (this.writeQueue.length) await new Promise((r) => setTimeout(r, 2100));
        }
      } finally {
        this.draining = null;
      }
    })();
    return this.draining;
  }

  /**
   * Block until queued writes have actually reached Xano, or the deadline passes.
   *
   * The queue exists so a rate-limited write never blocks a page render. On a
   * long-lived server that is free — the drain finishes on its own. On serverless
   * it is not: the function is frozen the moment the response closes, so anything
   * still queued is silently lost and the next request reads stale rows.
   *
   * Two concessions to that environment. The full-incident `save` carries the
   * evidence, the ledger and the decision, so it goes first — an audit line
   * arriving late costs nothing, a missing ledger costs the whole demo. And the
   * wait is bounded: pacing for the free tier's 10 req/20s can outlast the
   * function itself, so whatever has not landed by the deadline stays queued and
   * drains best-effort rather than taking the response down with it.
   */
  async flushWrites(deadlineMs = 8000): Promise<void> {
    const until = Date.now() + deadlineMs;
    // Saves carry the payload the UI reads back; audits are append-only detail.
    this.writeQueue.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "save" ? -1 : 1));
    while ((this.writeQueue.length || this.draining) && Date.now() < until) {
      await Promise.race([this.drain(), new Promise((r) => setTimeout(r, until - Date.now()))]);
    }
  }

  /**
   * Persist the evidence payload directly, bypassing the paced queue.
   *
   * The queue is the right default — it keeps a rate-limited write from blocking a
   * render. But it drops a task when a write fails, and during an investigation the
   * burst of audit rows reliably exhausts the free tier's window, so the one row the
   * UI reads back was the thing being thrown away. This takes the short path and
   * reports whether it landed.
   */
  async saveCore(incident: Incident): Promise<boolean> {
    if (this.hardDegraded) return false;
    this.local.saveIncident(incident);
    try {
      await this.xano.saveIncidentCore(incident);
      return true;
    } catch (err) {
      this.degradedReason = err instanceof Error ? err.message : String(err);
      console.warn(`[aegisflow] Xano core save failed (${this.degradedReason}).`);
      return false;
    }
  }

  /** For status displays: how many Xano writes are still catching up. */
  pendingWrites(): number {
    return this.writeQueue.length;
  }

  /** True when this incident's mirror is old enough to be worth re-reading. */
  private isStale(id: string): boolean {
    const readAt = this.hydrated.get(id);
    return readAt === undefined || Date.now() - readAt > this.hydrationTtlMs;
  }

  async listIncidents(): Promise<Incident[]> {
    // The dashboard reads from the mirror between refreshes, on the same TTL as a
    // single incident — no need to spend rate budget re-listing on every nav.
    if (this.down || !this.isStale(DEMO_INCIDENT.id)) return this.local.listIncidents();
    try {
      const rows = await this.xano.listIncidents();
      const now = Date.now();
      for (const inc of rows) {
        await this.local.saveIncident(structuredClone(inc));
        this.hydrated.set(inc.id, now);
      }
      return rows;
    } catch (err) {
      this.trip(err);
      return this.local.listIncidents();
    }
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    // Serve the mirror between reads — the free tier is rate-limited and every page
    // render would otherwise hit it — but re-read once the entry goes stale, so a
    // write made by another instance becomes visible here.
    if (!this.down && this.isStale(id)) {
      try {
        const fromXano = await this.xano.getIncident(id);
        this.hydrated.set(id, Date.now());
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
    const snapshot = structuredClone(incident);
    this.enqueueWrite("save", () => this.xano.saveIncident(snapshot));
  }

  async appendAudit(id: string, event: string, actor: "SYSTEM" | "AI" | "HUMAN"): Promise<void> {
    await this.local.appendAudit(id, event, actor);
    this.enqueueWrite("audit", () => this.xano.appendAudit(id, event, actor));
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
  return r instanceof ResilientRepository && r.mode === "LOCAL" ? r.degradedReason : undefined;
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
  await flushWrites();
}

/**
 * Ensure queued Xano writes have landed. No-op on the in-memory repository.
 * Call it at the end of any request that mutated state — on serverless the
 * process stops executing as soon as the response is sent.
 */
export async function flushWrites(deadlineMs?: number): Promise<void> {
  const r = getRepository();
  if (r instanceof ResilientRepository) await r.flushWrites(deadlineMs);
}

/**
 * Persist the incident's evidence payload now, and wait for it.
 * Returns false when it could not be written (the in-memory mirror still has it).
 */
export async function saveIncidentCore(incident: Incident): Promise<boolean> {
  const r = getRepository();
  if (r instanceof ResilientRepository) return r.saveCore(incident);
  await r.saveIncident(incident);
  return true;
}
