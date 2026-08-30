import { Globe } from "lucide-react";
import { Incident } from "@/schemas/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ExternalSources({ incident }: { incident: Incident }) {
  const sources = incident.externalSources ?? [];
  if (sources.length === 0) return null;

  const anyLive = sources.some((s) => s.mode === "LIVE");
  const queries = [...new Set(sources.map((s) => s.query))];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4 text-primary" /> External intelligence
        </CardTitle>
        <Badge variant={anyLive ? "success" : "muted"}>{anyLive ? "LIVE WEB (SerpApi)" : "DEMO SEEDED"}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        {queries.map((q) => (
          <div key={q}>
            <p className="mb-2 font-mono text-xs text-muted-foreground">query: {q}</p>
            <ul className="space-y-2">
              {sources.filter((s) => s.query === q).map((s) => (
                <li key={s.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    {s.url.startsWith("http") ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline">
                        {s.title}
                      </a>
                    ) : (
                      <span className="text-sm font-medium">{s.title}</span>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">relevance {s.relevance}%</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.snippet}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={s.mode === "LIVE" ? "success" : "muted"}>{s.mode}</Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">{s.url}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}