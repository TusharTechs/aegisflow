"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, Play } from "lucide-react";
import { Incident } from "@/schemas/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";

interface LiveStep {
  message: string;
  actor: string;
  tag?: string;
  time: string;
}

export function InvestigationConsole({ incident }: { incident: Incident }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<LiveStep[]>(
    incident.auditLog
      .filter((e) => e.actor !== "HUMAN")
      .map((e) => ({ message: e.event, actor: e.actor, time: e.timestamp }))
  );

  const start = async () => {
    setRunning(true);
    setSteps([]);
    try {
      const res = await fetch(`/api/incidents/${incident.id}/investigate`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          const data = JSON.parse(chunk.slice(6));
          if (data.done || data.error) continue;
          setSteps((prev) => [
            ...prev,
            { message: data.message, actor: data.actor, tag: data.tag, time: new Date().toISOString() },
          ]);
        }
      }
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">AI response status</CardTitle>
        {incident.state === "INVESTIGATING" && !running && (
          <Button onClick={start} size="sm">
            <Play className="h-3.5 w-3.5" /> Run Response
          </Button>
        )}
        {running && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      </CardHeader>
      <CardContent>
        {steps.length === 0 && !running ? (
          <p className="text-sm text-muted-foreground">Click Run Response to start the investigation.</p>
        ) : (
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span className="flex-1">
                  {s.message}
                  {s.tag === "DEMO SEEDED" && <Badge variant="muted" className="ml-2">DEMO SEEDED</Badge>}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{formatTime(s.time)}</span>
              </li>
            ))}
            {running && (
              <li className="flex items-start gap-3 text-sm text-muted-foreground">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> Working…
              </li>
            )}
            {!running && incident.state === "HUMAN_REVIEW" && (
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