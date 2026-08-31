"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Incident } from "@/schemas/core";
import { RankedSupplier } from "@/lib/suppliers/ranking";
import {
  DEFAULT_WEIGHTS,
  DIMENSIONS,
  DIMENSION_LABELS,
  RiskWeights,
  computeTotal,
  riskLevel,
} from "@/lib/risk/weights";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const barColor = (score: number) => (score >= 80 ? "bg-success" : score >= 60 ? "bg-warning" : "bg-destructive");
const levelVariant = (level: string) => (level === "LOW" ? "success" : level === "MEDIUM" ? "warning" : "critical");

export function WhyPanel({ incident, ranked }: { incident: Incident; ranked: RankedSupplier[] }) {
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const [selectedId, setSelectedId] = useState<string>(ranked[0]?.supplier.id ?? "");
  const selected = ranked.find((r) => r.supplier.id === selectedId) ?? ranked[0];
  const weightSum = DIMENSIONS.reduce((a, k) => a + weights[k], 0) || 1;

  const liveRanking = useMemo(
    () =>
      ranked
        .map((r) => ({ id: r.supplier.id, name: r.supplier.name, total: computeTotal(r.evaluation.scores, weights) }))
        .sort((a, b) => b.total - a.total),
    [ranked, weights]
  );
  const liveTotal = liveRanking.find((r) => r.id === selected?.supplier.id)?.total ?? 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="flex gap-2">
          {ranked.map((r) => (
            <button
              key={r.supplier.id}
              onClick={() => setSelectedId(r.supplier.id)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium",
                selectedId === r.supplier.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {r.supplier.name}
            </button>
          ))}
        </div>

        {selected && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{selected.supplier.name}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={levelVariant(riskLevel(liveTotal))}>{riskLevel(liveTotal)} RISK</Badge>
                <span className="text-2xl font-semibold">{liveTotal}/100</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {selected.evaluation.dimensions.map((d) => (
                <div key={d.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{DIMENSION_LABELS[d.key]}</span>
                    <span className="text-xs text-muted-foreground">
                      weight {Math.round((weights[d.key] / weightSum) * 100)}% · score {d.score}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className={cn("h-2 rounded-full", barColor(d.score))} style={{ width: `${d.score}%` }} />
                  </div>
                  <ul className="mt-2 space-y-1">
                    {d.reasons.map((reason, i) => (
                      <li key={i} className="text-xs text-muted-foreground">• {reason}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {selected && (
          <Card>
            <CardHeader><CardTitle className="text-base">Where each fact came from</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {selected.supplier.claims.map((c) => (
                  <li key={c.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.text}</span>
                      <Badge variant={c.status === "VERIFIED" ? "success" : c.status === "CONFLICT" ? "critical" : "warning"}>
                        {c.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Confidence {c.confidence}% ·{" "}
                      {c.documentEvidence ? (
                        <>
                          Document:{" "}
                          <a
                            className="text-primary hover:underline"
                            href={`/docs/${c.documentEvidence.documentId}.pdf`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {c.documentEvidence.documentId}
                          </a>{" "}
                          (field {c.documentEvidence.field}, {c.documentEvidence.mode})
                        </>
                      ) : (
                        <>Source: {c.source}</>
                      )}
                    </p>
                    {c.conflictReason && <p className="mt-1 text-xs text-destructive">{c.conflictReason}</p>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Risk model weights</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setWeights(DEFAULT_WEIGHTS)}>
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {DIMENSIONS.map((k) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{DIMENSION_LABELS[k]}</span>
                  <span className="font-mono">{Math.round((weights[k] / weightSum) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={weights[k]}
                  onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              The official recommendation uses default weights. Adjust them to stress-test the decision.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Live ranking</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {liveRanking.map((r, i) => (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-center justify-between rounded-md border p-3 text-sm",
                    r.id === ranked[0].supplier.id && "border-success/50 bg-success/5"
                  )}
                >
                  <span>
                    {i + 1}. {r.name}
                    {r.id === ranked[0].supplier.id && <Badge variant="success" className="ml-2">Official pick</Badge>}
                  </span>
                  <span className="font-semibold">{r.total}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}