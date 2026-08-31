import { ExternalSource, Incident } from "@/schemas/core";
import { isSerpConfigured, serpSearch } from "@/integrations/serpapi/client";
import { seededSourcesFor, Intent } from "@/data/demo/web-sources";
import type { ActivityLedger } from "@/lib/integrations/ledger";
import { getDemoFlags } from "@/lib/orchestration/demo-controls";

export interface WebIntelReport {
  sources: ExternalSource[];
  queries: string[];
  liveCount: number;
  seededCount: number;
}

interface PlannedQuery {
  query: string;
  intent: Intent;
  supplierId?: string;
}

export function buildQueries(incident: Incident): PlannedQuery[] {
  return [
    { query: `"${incident.affectedProduct}" alternative suppliers`, intent: "market" },
    { query: `${incident.supplier} disruption OR shortage news`, intent: "news" },
    ...incident.alternativeSuppliers.map((s) => ({
      query: `${s.name} ${s.location} manufacturer ISO 9001 certification`,
      intent: "supplier" as Intent,
      supplierId: s.id,
    })),
  ];
}

function relevance(query: string, title: string, snippet: string): number {
  const tokens = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
  const text = `${title} ${snippet}`.toLowerCase();
  let hits = 0;
  tokens.forEach((t) => {
    if (text.includes(t)) hits++;
  });
  return tokens.size ? Math.max(20, Math.round((hits / tokens.size) * 100)) : 50;
}

export async function runWebIntelligence(incident: Incident, ledger?: ActivityLedger): Promise<WebIntelReport> {
  const planned = buildQueries(incident);
  const sources: ExternalSource[] = [];
  const observedAt = new Date().toISOString();
  const serpFailInjected = getDemoFlags().serpapi;
  const serpEnabled = isSerpConfigured() && !serpFailInjected;
  const fallbackNote = serpFailInjected
    ? "SerpApi failure injected via demo control — deterministic per-query seeded corroboration used."
    : "SERPAPI_API_KEY not configured — deterministic per-query seeded corroboration used. Set the key to run this query live.";

  // Queries run concurrently — 5 sequential SerpApi round-trips is the slowest part
  // of the investigation. Results are merged back in planned order for stable ids.
  const perQuery = await Promise.all(
    planned.map(async (p) => {
      const req = { engine: "google", q: p.query, num: 4 };
      const start = Date.now();
      let liveResults: Awaited<ReturnType<typeof serpSearch>> | null = null;
      let liveError: string | null = null;

      if (serpEnabled) {
        try {
          liveResults = await serpSearch(p.query, 4);
        } catch (err) {
          liveError = err instanceof Error ? err.message : "unknown error";
        }
      }

      const entry = { p, req, start, liveResults, liveError };
      return entry;
    })
  );

  for (const { p, req, start, liveResults, liveError } of perQuery) {
    if (liveResults) {
      if (p.supplierId) {
        // Supplier-specific query: the call is real (see the ledger), but the demo
        // suppliers are fictional, so live hits are about similarly-named real
        // companies. Corroboration comes from the curated supplier-registry records
        // (what a licensed supplier-data feed returns), tagged DEMO SEEDED.
        for (const s of seededSourcesFor(p.intent, p.query, p.supplierId)) {
          sources.push({ ...s, id: `src-${sources.length + 1}`, observedAt });
        }
      } else {
        liveResults.forEach((r, i) => {
          sources.push({
            id: `src-${sources.length + 1}`,
            query: p.query,
            supplierId: p.supplierId,
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            engine: "google",
            observedAt,
            mode: "LIVE",
            relevance: Math.max(20, relevance(p.query, r.title, r.snippet) - i * 5),
          });
        });
      }
      ledger?.record({
        sponsor: "SerpApi",
        operation: `web-intelligence · ${p.intent}`,
        method: "GET",
        endpoint: "https://serpapi.com/search",
        request: req,
        response: { organic_results_count: liveResults.length, organic_results: liveResults },
        mode: "LIVE",
        status: "ok",
        ms: Date.now() - start,
        note:
          liveResults.length === 0
            ? "Zero organic results — recorded as absence of corroboration (a negative signal in the risk model)."
            : p.supplierId
              ? `${liveResults.length} live organic result(s) — logged for audit; corroboration drawn from supplier-registry records (fictional demo suppliers aren't on the live web).`
              : `${liveResults.length} organic result(s) merged into the case file.`,
      });
    } else {
      const seeded = seededSourcesFor(p.intent, p.query, p.supplierId);
      for (const s of seeded) sources.push({ ...s, id: `src-${sources.length + 1}`, observedAt });
      ledger?.record({
        sponsor: "SerpApi",
        operation: `web-intelligence · ${p.intent}`,
        method: "GET",
        endpoint: "https://serpapi.com/search",
        request: req,
        response: {
          seeded_results_count: seeded.length,
          seeded_results: seeded.map((s) => ({ title: s.title, url: s.url, relevance: s.relevance })),
          ...(liveError ? { live_error: liveError } : {}),
        },
        mode: "DEMO SEEDED",
        status: liveError ? "error" : "fallback",
        ms: Date.now() - start,
        note: liveError
          ? `Live SerpApi call failed (${liveError}); per-query seeded corroboration used for this query only.`
          : fallbackNote,
      });
    }
  }

  const liveCount = sources.filter((s) => s.mode === "LIVE").length;
  return { sources, queries: planned.map((p) => p.query), liveCount, seededCount: sources.length - liveCount };
}