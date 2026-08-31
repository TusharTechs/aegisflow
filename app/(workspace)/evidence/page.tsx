import { getIncident } from "@/lib/incidents/repository";
import { EvidenceSummary } from "@/components/incidents/evidence-summary";
import { ExternalSources } from "@/components/evidence/external-sources";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EvidencePage() {
  const incident = await getIncident("INC-1042");
  if (!incident) return null;

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Evidence</h1>
        <p className="mt-1 text-sm text-muted-foreground">Claim-level provenance: documents, external sources, verification status.</p>
      </div>
      <EvidenceSummary incident={incident} />
      <ExternalSources incident={incident} />
      <Card>
        <CardHeader><CardTitle className="text-base">Claim provenance</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {incident.alternativeSuppliers.flatMap((s) =>
              s.claims.map((c) => (
                <li key={c.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{s.name}: {c.text}</span>
                    <Badge variant={c.status === "VERIFIED" ? "success" : c.status === "CONFLICT" ? "critical" : "warning"}>
                      {c.status} · {c.confidence}%
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.documentEvidence ? (
                      <>Document: {c.documentEvidence.documentId} · field {c.documentEvidence.field} ({c.documentEvidence.mode})</>
                    ) : (
                      <>Source: {c.source}</>
                    )}
                    {c.conflictReason && <span className="text-destructive"> — {c.conflictReason}</span>}
                  </p>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}