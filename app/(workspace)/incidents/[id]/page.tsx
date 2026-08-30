import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { getIncident } from "@/lib/incidents/repository";
import { rankSuppliers } from "@/lib/suppliers/ranking";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BusinessImpact } from "@/components/incidents/business-impact";
import { ResponseTimeline } from "@/components/incidents/response-timeline";
import { EvidenceSummary } from "@/components/incidents/evidence-summary";
import { SupplierComparison } from "@/components/incidents/supplier-comparison";
import { DecisionPanel } from "@/components/incidents/decision-panel";
import { AuditTrail } from "@/components/incidents/audit-trail";
import { RunResponseButton } from "@/components/incidents/run-response-button";

type Props = { params: Promise<{ id: string }> | { id: string } };

export default async function IncidentPage({ params }: Props) {
  const { id } = await params;
  const incident = getIncident(id);
  if (!incident) notFound();

  const ranked = rankSuppliers(incident.alternativeSuppliers);
  const investigated = incident.state !== "INVESTIGATING";
  const recommendation = investigated ? ranked[0] : null;

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{incident.supplier}</h1>
            <Badge variant="critical">● Critical</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{incident.id}</span> · Supplier disruption · {incident.affectedProduct}
          </p>
        </div>
        {incident.state === "INVESTIGATING" ? (
          <RunResponseButton id={incident.id} />
        ) : (
          <Badge variant="info">{incident.state.replace(/_/g, " ")}</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <BusinessImpact incident={incident} />
          <ResponseTimeline incident={incident} />
          <EvidenceSummary incident={incident} />
          <SupplierComparison ranked={ranked} showScores={investigated} />
          <Card>
            <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              {["DOCUMENT_PREPARED", "SIGNATURE_REQUIRED", "SIGNED"].includes(incident.state)
                ? "Emergency transition agreement generated."
                : "The emergency transition agreement will be generated after human approval."}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <DecisionPanel incident={incident} recommendation={recommendation} />
          <AuditTrail incident={incident} />
        </div>
      </div>
    </div>
  );
}