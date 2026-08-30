import { Incident } from "@/schemas/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/utils";

export function AuditTrail({ incident }: { incident: Incident }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Audit trail</CardTitle></CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {incident.auditLog.map((e, i) => (
            <li key={i} className="flex items-start justify-between gap-2 text-xs">
              <div className="flex items-start gap-2">
                <Badge variant={e.actor === "HUMAN" ? "success" : e.actor === "AI" ? "info" : "muted"} className="shrink-0">
                  {e.actor}
                </Badge>
                <span className="text-muted-foreground">{e.event}</span>
              </div>
              <span className="shrink-0 font-mono text-muted-foreground">{formatTime(e.timestamp)}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}