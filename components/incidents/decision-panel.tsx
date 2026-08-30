import { UserCheck } from "lucide-react";
import { Incident } from "@/schemas/core";
import { RankedSupplier } from "@/lib/suppliers/ranking";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approve, reject, requestEvidence } from "@/lib/orchestration/actions";

export function DecisionPanel({ incident, recommendation }: { incident: Incident; recommendation: RankedSupplier | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Decision</CardTitle>
        <CardDescription>AI prepares. Humans authorize.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!recommendation ? (
          <p className="text-sm text-muted-foreground">Run the response to generate an evidence-backed recommendation.</p>
        ) : (
          <>
            <div className="space-y-2 rounded-md border bg-accent/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{recommendation.supplier.name}</span>
                <Badge variant="success">{recommendation.score}/100</Badge>
              </div>
              {incident.decision && (
                <>
                  <p className="text-xs leading-relaxed text-muted-foreground">{incident.decision.reasoning}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="info">Confidence {incident.decision.confidence}%</Badge>
                    <span>Reasoning: {incident.decision.source === "gemini" ? "Gemini" : "Deterministic fallback"}</span>
                  </div>
                  {incident.decision.risks.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <p className="text-xs font-medium text-destructive">Risks</p>
                      {incident.decision.risks.map((r, i) => (
                        <p key={i} className="text-xs text-muted-foreground">• {r}</p>
                      ))}
                    </div>
                  )}
                  {incident.decision.unknowns.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <p className="text-xs font-medium text-warning">Unknowns</p>
                      {incident.decision.unknowns.map((u, i) => (
                        <p key={i} className="text-xs text-muted-foreground">• {u}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {incident.state === "HUMAN_REVIEW" && (
              <div className="space-y-2">
                <form action={approve.bind(null, incident.id)}>
                  <Button variant="success" className="w-full"><UserCheck className="h-4 w-4" /> Approve transition</Button>
                </form>
                <form action={requestEvidence.bind(null, incident.id)}>
                  <Button variant="outline" className="w-full">Request more evidence</Button>
                </form>
                <form action={reject.bind(null, incident.id)}>
                  <Button variant="destructive" className="w-full">Reject recommendation</Button>
                </form>
              </div>
            )}
            {incident.state === "APPROVED" && <Badge variant="success">Approved — preparing documents</Badge>}
            {incident.state === "REJECTED" && <Badge variant="critical">Recommendation rejected</Badge>}
            {["DOCUMENT_PREPARED", "SIGNATURE_REQUIRED", "SIGNED"].includes(incident.state) && (
              <Badge variant="info">{incident.state.replace(/_/g, " ")}</Badge>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}