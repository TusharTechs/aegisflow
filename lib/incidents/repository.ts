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
  private readonly hydrationTtlMs = Number(process.env.XANO_HYDRATION_TTL_MS ?? 60000);
  /** Only audit rows queue now — incident saves are written directly. */
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
    // re-pulling stale state. The Xano write is NOT queued here — see resetAndPersist.
    this.hydrated = new Map([[DEMO_INCIDENT.id, Date.now()]]);
  }

  /**
   * Reset, then write the fresh state to Xano directly and wait for it.
   *
   * The reset used to enqueue a paced save, which is a time bomb on serverless: the
   * queue does not finish inside the flush deadline, the function freezes with the
   * task pending, and a LATER request on the same warm instance resumes the drain —
   * writing the reset snapshot over a completed investigation. The symptom is an
   * incident that has verdicts (the seeded ones) but no ledger and no decision, back
   * in INVESTIGATING, with the run that just succeeded erased.
   */
  async resetAndPersist(): Promise<void> {
    this.reset();
    const fresh = structuredClone(DEMO_INCIDENT);
    await this.local.saveIncident(structuredClone(fresh));
    await this.saveCore(fresh);
  }

  /**
   * Record a Xano failure and decide how long to stop trying.
   *
   * Only a schema problem is permanent — that one needs a human to fix the table,
   * and retrying just makes noise. Everything else self-heals: a rate limit is a
   * 20s window, and a network blip or 5xx is worth retrying in a minute. This used
   * to mark ANY non-429 failure as permanently degraded, which on serverless meant
   * one transient error poisoned that instance for the rest of its life — so the
   * same deployment would serve "Xano: CONFIGURED" from most instances and
   * "fell back this run" from one unlucky one, at random, forever.
   */
  private trip(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    this.degradedReason = msg;

    if (/429|rate limit|too many requests/i.test(msg)) {
      this.coolingUntil = Date.now() + 20_000;
      return;
    }
    if (/has no `?incident_key`?/i.test(msg)) {
      if (!this.hardDegraded) {
        this.hardDegraded = true;
        console.warn(`[aegisflow] Xano schema problem (${msg}); serving from the in-memory store.`);
      }
      return;
    }
    // Transient infrastructure — back off, then try again.
    this.coolingUntil = Date.now() + 60_000;
    console.warn(`[aegisflow] Xano read failed (${msg}); retrying in 60s.`);
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
    await this.local.saveIncident(incident);
    // Attempt even while cooling. The cooldown exists to stop READS burning the
    // rate budget; this is one request and it carries the run. Skipping it was why
    // a signed agreement could read HUMAN_REVIEW afterwards — the write was dropped
    // to protect a budget it barely touches.
    if (this.hardDegraded) return false;
    // This instance is now ahead of Xano; do not let the TTL pull the older row back.
    this.hydrated.set(incident.id, Date.now());
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

  /**
   * Persist the incident. One Xano request, written now, not queued.
   *
   * This used to enqueue `xano.saveIncident`, whose supplier/claim fan-out is ~15
   * paced requests. Against a 10-per-20-second budget that guaranteed rate limiting,
   * and because a queued task carries a SNAPSHOT, one that started before a newer
   * write could finish after it and put the older state back — which is how a signed
   * agreement ended up reading RECOMMENDATION_READY.
   *
   * The incident row already carries everything the UI reads back: evidence, ledger,
   * decision, footprints, the audit stream and the verdict overlay. The normalised
   * supplier/claim tables are the schema the app is built on and are seeded by
   * scripts/seed-xano.mjs; they are not on the request path.
   */
  async saveIncident(incident: Incident): Promise<void> {
    await this.saveCore(incident);
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
  const r = getRepository();
  if (r instanceof ResilientRepository) {
    await r.resetAndPersist();
    return;
  }
  r.reset?.();
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
