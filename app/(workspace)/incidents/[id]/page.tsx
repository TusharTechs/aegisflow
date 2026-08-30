import { notFound } from "next/navigation";
import { getIncident } from "@/lib/incidents/repository";
import { rankSuppliers } from "@/lib/suppliers/ranking";
import { corroborationBySupplier } from "@/lib/agents/verification";
import { Badge } from "@/components/ui/badge";
import { BusinessImpact } from "@/components/incidents/business-impact";
import { InvestigationConsole } from "@/components/incidents/investigation-console";
import { EvidenceSummary } from "@/components/incidents/evidence-summary";
import { SupplierComparison } from "@/components/incidents/supplier-comparison";
import { DecisionPanel } from "@/components/incidents/decision-panel";
import { AuditTrail } from "@/components/incidents/audit-trail";
import { ExternalSources } from "@/components/evidence/external-sources";
import { ProcessedDocuments } from "@/components/documents/processed-documents";

type Props = { params: Promise<{ id: string }> | { id: string } };

export default async function IncidentPage({ params }: Props) {
  const { id } = await params;
  const incident = await getIncident(id);
  if (!incident) notFound();
  
  const ranked = rankSuppliers(incident.alternativeSuppliers);
  const externalCounts = corroborationBySupplier(incident);
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
        {investigated && <Badge variant="info">{incident.state.replace(/_/g, " ")}</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <BusinessImpact incident={incident} />
          <InvestigationConsole incident={incident} />
          <EvidenceSummary incident={incident} />
          <ExternalSources incident={incident} />
          <SupplierComparison ranked={ranked} showScores={investigated} externalCounts={externalCounts} />
          <ProcessedDocuments incident={incident} />
        </div>

        <div className="space-y-6">
          <DecisionPanel incident={incident} recommendation={recommendation} />
          <AuditTrail incident={incident} />
        </div>
      </div>
    </div>
  );
}