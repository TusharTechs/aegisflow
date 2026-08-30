import { Claim, Incident } from "@/schemas/core";

export interface VerificationReport {
  verified: number;
  conflicts: number;
  unverified: number;
  flagged: { supplierId: string; claim: Claim }[];
}

export function verifyClaims(incident: Incident): VerificationReport {
  const report: VerificationReport = { verified: 0, conflicts: 0, unverified: 0, flagged: [] };
  for (const supplier of incident.alternativeSuppliers) {
    for (const claim of supplier.claims) {
      if (claim.status === "VERIFIED") report.verified++;
      else if (claim.status === "CONFLICT") {
        report.conflicts++;
        report.flagged.push({ supplierId: supplier.id, claim });
      } else if (claim.status === "UNVERIFIED") {
        report.unverified++;
        report.flagged.push({ supplierId: supplier.id, claim });
      }
    }
  }
  return report;
}

export function corroborationBySupplier(incident: Incident): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const source of incident.externalSources ?? []) {
    if (source.supplierId && source.relevance >= 60) {
      counts[source.supplierId] = (counts[source.supplierId] ?? 0) + 1;
    }
  }
  return counts;
}