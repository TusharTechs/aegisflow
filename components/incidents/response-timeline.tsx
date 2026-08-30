import { CheckCircle2, Loader2 } from "lucide-react";
import { Incident } from "@/schemas/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";

export function ResponseTimeline({ incident }: { incident: Incident }) {
  const steps = incident.auditLog.filter((e) => e.actor !== "HUMAN");
  const idle = steps.length <= 1;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">AI response status</CardTitle>
        {idle && <span className="text-xs text-muted-foreground">Awaiting response run</span>}
      </CardHeader>
      <CardContent>
        {idle ? (
          <p className="text-sm text-muted-foreground">Click Run Response to start the investigation.</p>
        ) : (
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span className="flex-1">{s.event}</span>
                <span className="font-mono text-xs text-muted-foreground">{formatTime(s.timestamp)}</span>
              </li>
            ))}
            {incident.state === "HUMAN_REVIEW" && (
              <li className="flex items-start gap-3 text-sm">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span className="font-medium">Human review required</span>
              </li>
            )}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}