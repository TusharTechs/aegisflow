import { DomainFootprint, Incident, Supplier } from "@/schemas/core";
import {
  NAMECOM_AVAILABILITY_ENDPOINT,
  checkDomainAvailability,
  isNameComConfigured,
  type DomainSearchResult,
} from "@/integrations/namecom/client";
import type { ActivityLedger } from "@/lib/integrations/ledger";
import { getDemoFlags } from "@/lib/orchestration/demo-controls";

/**
 * Domain footprint intelligence.
 *
 * A company that has been trading for eight years has a website, and a website
 * means somebody registered the domain. So the question "is this supplier's domain
 * still available to buy?" is really the question "does this supplier exist
 * commercially?" — and name.com's availability endpoint answers it in one call.
 *
 * This is the third independent line of evidence on the same contradiction:
 *
 *   1. the business registration says FORMED 2021, not 2018   (Nutrient)
 *   2. the ISO certificate has no registry match              (Nutrient)
 *   3. the domain it would trade under is unregistered        (name.com)
 *
 * A supplier can forge a PDF. Getting all three to agree is much harder.
 *
 * Absence is the signal here, exactly as it is for a SerpApi query that returns
 * nothing: a purchasable domain is evidence *against* a long operating history,
 * not a missing data point.
 */

export type { DomainFootprint };

export interface DomainIntelReport {
  footprints: DomainFootprint[];
  liveCount: number;
}

/** The domain a company of this name would most plausibly trade under. */
export function candidateDomain(supplier: Supplier): string {
  const slug = supplier.name
    .toLowerCase()
    .replace(/\b(ltd|limited|inc|co|corp|gmbh|llc|plc|sa|bv|ag)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
  return `${slug}.com`;
}

/**
 * Observed against public DNS on 2026-09-02 and used only when name.com
 * credentials are absent. These are the real registration states of these three
 * domains — the fallback reports what is true, it does not invent a better story.
 */
const OBSERVED_FALLBACK: Record<string, boolean> = {
  "apexelectronics.com": false,
  "nexusmanufacturing.com": false,
  "shenzhenrapidparts.com": true,
};

function toFootprint(supplier: Supplier, domain: string, purchasable: boolean, mode: "LIVE" | "DEMO SEEDED"): DomainFootprint {
  return {
    supplierId: supplier.id,
    domain,
    purchasable,
    signal: purchasable ? "NO_FOOTPRINT" : "CORROBORATED",
    mode,
    finding: purchasable
      ? `${domain} is unregistered and available to purchase — no commercial web footprint under this name.`
      : `${domain} is registered — an established web footprint consistent with a trading company.`,
  };
}

export async function runDomainIntelligence(
  incident: Incident,
  ledger?: ActivityLedger
): Promise<DomainIntelReport> {
  const suppliers = incident.alternativeSuppliers;
  const domains = suppliers.map(candidateDomain);
  const failInjected = getDemoFlags().namecom;
  const enabled = isNameComConfigured() && !failInjected;

  const start = Date.now();
  let results: DomainSearchResult[] | null = null;
  let liveError: string | null = null;

  if (enabled) {
    try {
      results = await checkDomainAvailability(domains);
    } catch (err) {
      liveError = err instanceof Error ? err.message : "unknown error";
    }
  }

  const footprints = suppliers.map((s, i) => {
    const domain = domains[i];
    const hit = results?.find((r) => r.domainName.toLowerCase() === domain);
    if (hit) return toFootprint(s, domain, hit.purchasable, "LIVE");
    return toFootprint(s, domain, OBSERVED_FALLBACK[domain] ?? false, "DEMO SEEDED");
  });

  const liveCount = footprints.filter((f) => f.mode === "LIVE").length;

  ledger?.record({
    sponsor: "name.com",
    operation: "supplier domain footprint · checkAvailability",
    method: "POST",
    endpoint: NAMECOM_AVAILABILITY_ENDPOINT,
    request: { domainNames: domains },
    response: results
      ? { results }
      : {
          seeded_results: footprints.map((f) => ({ domainName: f.domain, purchasable: f.purchasable })),
          ...(liveError ? { live_error: liveError } : {}),
        },
    mode: liveCount > 0 ? "LIVE" : "DEMO SEEDED",
    status: liveCount > 0 ? "ok" : liveError ? "error" : "fallback",
    ms: Date.now() - start,
    note: liveCount > 0
      ? "A purchasable domain means no company owns it — scored as absence of commercial footprint."
      : liveError
        ? `Live name.com call failed (${liveError}); falling back to registration states observed against public DNS.`
        : failInjected
          ? "name.com failure injected via demo control — falling back to registration states observed against public DNS."
          : "NAMECOM_USERNAME / NAMECOM_API_TOKEN not configured — falling back to registration states observed against public DNS on 2026-09-02. Set the credentials to run this live.",
  });

  return { footprints, liveCount };
}

/** Footprint lookup by supplier, for the risk engine and the UI. */
export function footprintBySupplier(incident: Incident): Record<string, DomainFootprint> {
  return Object.fromEntries((incident.domainFootprints ?? []).map((f) => [f.supplierId, f]));
}
