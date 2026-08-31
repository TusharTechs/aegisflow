import { getIncident } from "@/lib/incidents/repository";
import { AuditTrail } from "@/components/incidents/audit-trail";

export default async function AuditPage() {
  const incident = await getIncident("INC-1042");
  if (!incident) return null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">Append-only event history for {incident.id}.</p>
      </div>
      <AuditTrail incident={incident} />
    </div>
  );
}