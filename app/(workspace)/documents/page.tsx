import { ExternalLink } from "lucide-react";
import { getIncident } from "@/lib/incidents/repository";
import { ProcessedDocuments } from "@/components/documents/processed-documents";
import { DOC_REGISTRY } from "@/data/demo/documents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DocumentsPage() {
  const incident = await getIncident("INC-1042");
  if (!incident) return null;

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">Source documents and generated agreements for {incident.id}.</p>
      </div>
      <ProcessedDocuments incident={incident} />
      <Card>
        <CardHeader><CardTitle className="text-base">Source documents</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {DOC_REGISTRY.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.type}</p>
                </div>
                <a href={`/docs/${d.id}.pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  View <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}