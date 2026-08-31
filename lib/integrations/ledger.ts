import { ApiCall, Incident } from "@/schemas/core";

export type SponsorName = ApiCall["sponsor"];

let onIncidentSeq = 0;

/**
 * Append a single API call to an incident's ledger from outside an investigation
 * run (e.g. the Doctavian / Foxit calls that happen during human-authorized steps).
 */
export function recordOnIncident(incident: Incident, entry: Omit<ApiCall, "id" | "at">): void {
  (incident.apiActivity ??= []).push({
    ...entry,
    id: `api-${Date.now().toString(36)}-x${onIncidentSeq++}`,
    at: new Date().toISOString(),
  });
}

/**
 * The Integration Activity Ledger.
 *
 * Every touchpoint with a sponsor API — whether it returned LIVE data, fell back
 * to LOCAL processing, or ran against a DEMO SEEDED fixture — is appended here so
 * a judge can open one panel and see exactly which service did which work, with
 * the real request we sent and the real (or representative) response we got back.
 *
 * Nothing here is faked: `mode` and `status` always reflect what actually happened.
 */
export class ActivityLedger {
  private calls: ApiCall[] = [];
  private seq = 0;

  record(entry: Omit<ApiCall, "id" | "at">): ApiCall {
    const call: ApiCall = {
      ...entry,
      id: `api-${Date.now().toString(36)}-${this.seq++}`,
      at: new Date().toISOString(),
    };
    this.calls.push(call);
    return call;
  }

  /** Time an async operation and record the outcome in one call. */
  async track<T>(
    meta: Pick<ApiCall, "sponsor" | "operation" | "method" | "endpoint"> & {
      request?: unknown;
      liveMode?: ApiCall["mode"];
      fallbackMode?: ApiCall["mode"];
      onLive: () => Promise<{ value: T; response: unknown; note?: string }>;
      onFallback: () => Promise<{ value: T; response: unknown; note?: string }> | { value: T; response: unknown; note?: string };
      enabled: boolean;
    }
  ): Promise<T> {
    const start = Date.now();
    if (meta.enabled) {
      try {
        const { value, response, note } = await meta.onLive();
        this.record({
          sponsor: meta.sponsor,
          operation: meta.operation,
          method: meta.method,
          endpoint: meta.endpoint,
          request: meta.request,
          response,
          mode: meta.liveMode ?? "LIVE",
          status: "ok",
          ms: Date.now() - start,
          note,
        });
        return value;
      } catch (err) {
        const fb = await meta.onFallback();
        this.record({
          sponsor: meta.sponsor,
          operation: meta.operation,
          method: meta.method,
          endpoint: meta.endpoint,
          request: meta.request,
          response: fb.response,
          mode: meta.fallbackMode ?? "LOCAL",
          status: "error",
          ms: Date.now() - start,
          note: fb.note ?? `Live call failed (${err instanceof Error ? err.message : "unknown"}); used fallback.`,
        });
        return fb.value;
      }
    }
    const fb = await meta.onFallback();
    this.record({
      sponsor: meta.sponsor,
      operation: meta.operation,
      method: meta.method,
      endpoint: meta.endpoint,
      request: meta.request,
      response: fb.response,
      mode: meta.fallbackMode ?? "LOCAL",
      status: "fallback",
      ms: Date.now() - start,
      note: fb.note ?? "API key not configured — used deterministic fallback.",
    });
    return fb.value;
  }

  all(): ApiCall[] {
    return [...this.calls];
  }
}

/** Group ledger entries by sponsor for the Integration Activity panel. */
export function groupBySponsor(calls: ApiCall[]): Record<SponsorName, ApiCall[]> {
  const out = {} as Record<SponsorName, ApiCall[]>;
  for (const c of calls) {
    (out[c.sponsor] ??= []).push(c);
  }
  return out;
}

export interface SponsorMeta {
  name: SponsorName;
  challenge: string;
  role: string;
  docsUrl: string;
}

/** What each sponsor API does in the AegisFlow workflow — shown in the panel. */
export const SPONSOR_META: SponsorMeta[] = [
  {
    name: "SerpApi",
    challenge: "Best AI Use Case",
    role: "Live web intelligence. AegisFlow runs one query per supplier plus market and disruption-news queries. Low or zero corroboration is treated as a negative signal, not ignored.",
    docsUrl: "https://serpapi.com/search-api",
  },
  {
    name: "Nutrient",
    challenge: "Turn Documents Into Something People Actually Trust",
    role: "Document intelligence on both ends: text + field extraction from the six supplier PDFs on ingestion, and a PENDING-SIGNATURE watermark applied to the generated agreement before it reaches a human.",
    docsUrl: "https://www.nutrient.io/api/",
  },
  {
    name: "Doctavian",
    challenge: "Generate It Right. Sign It Tight.",
    role: "Turns the structured, evidence-backed decision payload into the Emergency Supplier Transition Agreement. The decision → payload → document chain is visible in the UI.",
    docsUrl: "https://www.doctavian.com/",
  },
  {
    name: "Foxit",
    challenge: "Your Agent Shouldn't Sign That",
    role: "eSign session creation at the signature boundary. The agent prepares the document and the signing request; a finite-state guard makes it structurally impossible for the agent to sign.",
    docsUrl: "https://developer-api.foxit.com/esign/",
  },
  {
    name: "Xano",
    challenge: "Rebuild a SaaS Tool You Hate",
    role: "System of record for the tool we rebuilt — the disruption war-room spreadsheet. Normalized incident → supplier → claim tables plus an append-only audit_event stream.",
    docsUrl: "https://www.xano.com/",
  },
  {
    name: "Gemini",
    challenge: "(interpretation layer)",
    role: "Interpretation only — analyst summary and decision narrative. Every response is Zod-validated; facts and scores come from documents and deterministic computation, never the model.",
    docsUrl: "https://ai.google.dev/",
  },
];
