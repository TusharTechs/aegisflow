import { getDemoFlags } from "@/lib/orchestration/demo-controls";

/**
 * name.com Core API.
 *
 * Used here for something a domain API is not usually pointed at: judging whether
 * a supplier is a real going concern. A manufacturer that claims eight years of
 * trading has a website, and a website means a registered domain. If the domain it
 * would trade under is still sitting there **available to buy**, that is a fact
 * about the company, not about domains.
 *
 * Auth is HTTP Basic — `username:token`. Production is api.name.com; the sandbox
 * at api.dev.name.com takes sandbox credentials.
 *
 *   NAMECOM_USERNAME   name.com account username (append `-test` for sandbox)
 *   NAMECOM_API_TOKEN  API token from the matching environment
 *   NAMECOM_API_BASE   defaults to https://api.name.com
 */
const BASE = (process.env.NAMECOM_API_BASE || "https://api.name.com").replace(/\/$/, "");

// The `:` in the path is part of the operation name and must NOT be percent-encoded.
export const NAMECOM_AVAILABILITY_ENDPOINT = `${BASE}/core/v1/domains:checkAvailability`;

export interface DomainSearchResult {
  domainName: string;
  /** True when the domain can be bought — i.e. nobody has registered it. */
  purchasable: boolean;
  purchaseType?: string;
  purchasePrice?: number;
  premium?: boolean;
}

export function isNameComConfigured(): boolean {
  return Boolean(process.env.NAMECOM_USERNAME && process.env.NAMECOM_API_TOKEN);
}

function authHeader(): string {
  const raw = `${process.env.NAMECOM_USERNAME}:${process.env.NAMECOM_API_TOKEN}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

/** Check up to 50 domains in one call. Rate limit is 20 req/s, so one call is plenty. */
export async function checkDomainAvailability(domainNames: string[]): Promise<DomainSearchResult[]> {
  if (getDemoFlags().namecom) throw new Error("name.com failure injected for demo");
  if (!isNameComConfigured()) throw new Error("NAMECOM_USERNAME / NAMECOM_API_TOKEN not configured");
  if (domainNames.length === 0) return [];
  if (domainNames.length > 50) throw new Error("checkAvailability accepts at most 50 domains per call");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(NAMECOM_AVAILABILITY_ENDPOINT, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ domainNames }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`name.com HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
    }
    const json = await res.json();
    const results = (json.results ?? []) as Array<Record<string, unknown>>;
    return results.map((r) => ({
      domainName: String(r.domainName ?? ""),
      purchasable: Boolean(r.purchasable),
      purchaseType: typeof r.purchaseType === "string" ? r.purchaseType : undefined,
      purchasePrice: typeof r.purchasePrice === "number" ? r.purchasePrice : undefined,
      premium: typeof r.premium === "boolean" ? r.premium : undefined,
    }));
  } finally {
    clearTimeout(timeout);
  }
}
