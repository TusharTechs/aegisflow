export interface SerpResult {
  title: string;
  url: string;
  snippet: string;
}

export function isSerpConfigured(): boolean {
  return Boolean(process.env.SERPAPI_API_KEY);
}

export async function serpSearch(query: string, num = 4): Promise<SerpResult[]> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY not configured");

  const params = new URLSearchParams({ engine: "google", q: query, num: String(num), api_key: key });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

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