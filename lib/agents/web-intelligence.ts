import { ExternalSource, Incident } from "@/schemas/core";
import { isSerpConfigured, serpSearch } from "@/integrations/serpapi/client";
import { seededSourcesFor, Intent } from "@/data/demo/web-sources";

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

export async function runWebIntelligence(incident: Incident): Promise<WebIntelReport> {
  const planned = buildQueries(incident);
  const sources: ExternalSource[] = [];
  const observedAt = new Date().toISOString();

  for (const p of planned) {
    let gotLive = false;
    if (isSerpConfigured()) {
      try {
        const results = await serpSearch(p.query, 4);
        results.forEach((r, i) => {
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
        gotLive = results.length > 0;
      } catch {
        gotLive = false; // graceful per-query fallback; never fabricate
      }
    }
    if (!gotLive) {
      for (const s of seededSourcesFor(p.intent, p.query, p.supplierId)) {
        sources.push({ ...s, id: `src-${sources.length + 1}`, observedAt });
      }
    }
  }

  const liveCount = sources.filter((s) => s.mode === "LIVE").length;
  return { sources, queries: planned.map((p) => p.query), liveCount, seededCount: sources.length - liveCount };
}