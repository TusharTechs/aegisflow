import { getIncident } from "@/lib/incidents/repository";
import { StateStepper } from "@/components/incidents/state-stepper";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";

export default async function ApprovalsPage() {
  const incident = await getIncident("INC-1042");
  if (!incident) return null;
  const humanEvents = incident.auditLog.filter((e) => e.actor === "HUMAN");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Human decision queue. AI prepares; humans authorize.</p>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{incident.id} · {incident.supplier}</CardTitle>
          <Badge variant="critical">● Critical</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <StateStepper state={incident.state} />
          {incident.signature ? (
            <p className="text-sm text-muted-foreground">
              Signed by <span className="font-medium text-foreground">{incident.signature.signerName}</span> ({incident.signature.signerTitle}).
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Awaiting human authorization at the appropriate stage.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Human actions</CardTitle></CardHeader>
        <CardContent>
          {humanEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No human actions recorded yet.</p>
          ) : (
            <ol className="space-y-2">
              {humanEvents.map((e, i) => (
                <li key={i} className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{e.event}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatTime(e.timestamp)}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}