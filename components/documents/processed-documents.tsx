import { ExternalLink, FileSignature, FileText } from "lucide-react";
import { Incident } from "@/schemas/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ProcessedDocuments({ incident }: { incident: Incident }) {
  const docs = incident.documentsProcessed;
  const anyLive = docs?.some((d) => d.mode === "LIVE") ?? false;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Documents</CardTitle>
        {docs && docs.length > 0 && (
          <Badge variant={anyLive ? "success" : "muted"}>{anyLive ? "NUTRIENT LIVE" : "LOCAL EXTRACTION"}</Badge>
        )}
      </CardHeader>
      <CardContent>
        {!docs || docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Supplier documents will be processed during the response run.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.type} · {d.fieldCount} fields extracted</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={d.mode === "LIVE" ? "success" : "muted"}>{d.mode}</Badge>
                  <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </li>
            ))}

            {incident.generatedDocument && (
              <li className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="flex items-center gap-3">
                  <FileSignature className="h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">{incident.generatedDocument.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Generated {incident.generatedDocument.generatedAt.slice(0, 10)} · from structured decision
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={incident.generatedDocument.mode === "LIVE" ? "success" : "muted"}>
                    {incident.generatedDocument.mode === "LIVE" ? "DOCTAVIAN" : "LOCAL"}
                  </Badge>
                  <a href={incident.generatedDocument.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}