import { getDemoFlags } from "@/lib/orchestration/demo-controls";

export interface SerpResult {
  title: string;
  url: string;
  snippet: string;
}

export function isSerpConfigured(): boolean {
  return Boolean(process.env.SERPAPI_API_KEY);
}

export async function serpSearch(query: string, num = 4): Promise<SerpResult[]> {
  if (getDemoFlags().serpapi) throw new Error("SerpApi failure injected for demo");
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY not configured");

  const params = new URLSearchParams({ engine: "google", q: query, num: String(num), api_key: key });
  const controller = new AbortController();
  // The five queries run concurrently, so a longer ceiling costs wall-clock time
  // only in the worst case — and an 8s cutoff was intermittently timing out the
  // supplier queries, downgrading live results to seeded for no good reason.
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`https://serpapi.com/search?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`SerpApi HTTP ${res.status}`);
    const json = await res.json();
    const organic = (json.organic_results ?? []) as Array<{ title?: string; link?: string; snippet?: string }>;
    return organic
      .slice(0, num)
      .map((r) => ({ title: r.title ?? "", url: r.link ?? "", snippet: r.snippet ?? "" }))
      .filter((r) => r.title && r.url);
  } finally {
    clearTimeout(timeout);
  }
}