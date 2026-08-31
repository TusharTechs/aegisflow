import { ArrowRight, ExternalLink, FileSignature, UserCheck } from "lucide-react";
import { Incident } from "@/schemas/core";
import { RankedSupplier } from "@/lib/suppliers/ranking";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approve, prepareDocuments, reject, requestEvidence, signAgreement } from "@/lib/orchestration/actions";

const inputCls =
  "h-9 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DecisionPanel({ incident, recommendation }: { incident: Incident; recommendation: RankedSupplier | null }) {
  const doc = incident.generatedDocument;

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
                  <a
                    href={`/incidents/${incident.id}/why`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Why this recommendation? <ArrowRight className="h-3 w-3" />
                  </a>
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

            {incident.state === "APPROVED" && (
              <form action={prepareDocuments.bind(null, incident.id)}>
                <Button className="w-full">Prepare transition package</Button>
              </form>
            )}

            {(incident.state === "DOCUMENT_PREPARED" || incident.state === "SIGNATURE_REQUIRED") && doc && (
              <div className="space-y-3 rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{doc.title}</span>
                  <Badge variant={doc.mode === "LIVE" ? "success" : "muted"}>
                    {doc.mode === "LIVE" ? "DOCTAVIAN" : "LOCAL RENDER"}
                  </Badge>
                </div>
                <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  View agreement <ExternalLink className="h-3 w-3" />
                </a>

                {incident.state === "SIGNATURE_REQUIRED" && (
                  <form action={signAgreement.bind(null, incident.id)} className="space-y-2 pt-2">
                    <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
                      <p className="font-semibold">HUMAN ACTION REQUIRED</p>
                      <p className="mt-1 text-muted-foreground">
                        AegisFlow prepared this agreement. Only an authorized human can sign it. Signing is irreversible.
                      </p>
                    </div>
                    <input name="signerName" required placeholder="Full name" className={inputCls} />
                    <input name="signerTitle" required placeholder="Title (e.g. VP Procurement)" className={inputCls} />
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" name="authorized" required className="mt-0.5 h-4 w-4" />
                      I am authorized to bind {doc.payload.buyer} and understand this signature is irreversible.
                    </label>
                    <Button className="w-full" type="submit">
                      <FileSignature className="h-4 w-4" /> Sign agreement
                    </Button>
                  </form>
                )}
              </div>
            )}

            {incident.state === "SIGNED" && incident.signature && (
              <div className="rounded-md border border-success/40 bg-success/10 p-4 text-sm">
                <p className="font-semibold text-success">Signed</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {incident.signature.signerName} ({incident.signature.signerTitle}) · {incident.signature.signedAt.slice(0, 10)}
                  {incident.signature.foxitSessionId ? ` · Foxit session ${incident.signature.foxitSessionId}` : " · In-app ceremony"}
                </p>
              </div>
            )}

            {incident.state === "REJECTED" && <Badge variant="critical">Recommendation rejected</Badge>}
          </>
        )}
      </CardContent>
    </Card>
  );
}