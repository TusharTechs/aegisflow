import { AlertTriangle, ArrowRight, FileX2, ShieldX, SearchX, Globe } from "lucide-react";
import { Incident } from "@/schemas/core";
import { corroborationBySupplier } from "@/lib/agents/verification";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * The money shot. When the cheapest alternative carries claims that do not survive
 * verification, AegisFlow says so — loudly — and refuses to treat them as true.
 */
export function EvidenceConflict({ incident }: { incident: Incident }) {
  const flagged = incident.alternativeSuppliers
    .map((s) => ({
      supplier: s,
      bad: s.claims.filter((c) => c.status === "CONFLICT" || c.status === "UNVERIFIED"),
    }))
    .filter((x) => x.bad.length > 0);

  if (flagged.length === 0) return null;

  // Focus on the cheapest flagged supplier — the one a cost-only model would pick.
  const target = [...flagged].sort((a, b) => a.supplier.costMultiplier - b.supplier.costMultiplier)[0];
  const cheapest = incident.alternativeSuppliers.every(
    (s) => s.costMultiplier >= target.supplier.costMultiplier
  );
  const corr = corroborationBySupplier(incident)[target.supplier.id] ?? 0;
  const footprint = (incident.domainFootprints ?? []).find((f) => f.supplierId === target.supplier.id);

  const cards = [
    ...target.bad.map((c) => ({
      icon: c.status === "CONFLICT" ? FileX2 : ShieldX,
      status: c.status,
      claim: c.text,
      claimSource: c.documentEvidence
        ? `${c.documentEvidence.documentId} · ${c.documentEvidence.field}`
        : c.source,
      finding: c.conflictReason ?? "Could not be independently verified.",
      confidence: c.confidence,
      rule: c.documentEvidence?.rule,
    })),
    {
      icon: SearchX,
      status: "NO CORROBORATION" as const,
      claim: "Independent web corroboration",
      claimSource: "SerpApi · live supplier query",
      finding:
        corr === 0
          ? "Zero independent sources found. Absence of corroboration is treated as a negative signal."
          : `${corr} corroborating source(s) — below the threshold to offset the conflicts above.`,
      confidence: undefined as number | undefined,
      rule: undefined as string | undefined,
    },
    ...(footprint && footprint.signal === "NO_FOOTPRINT"
      ? [
          {
            icon: Globe,
            status: "NO DOMAIN" as const,
            claim: footprint.domain,
            claimSource: `name.com · checkAvailability · ${footprint.mode}`,
            finding: `${footprint.finding} A company trading since 2018 would have registered it.`,
            confidence: undefined as number | undefined,
            rule: undefined as string | undefined,
          },
        ]
      : []),
  ];

  return (
    <Card className="border-destructive/40 bg-destructive/[0.03]">
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-destructive/10 p-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Evidence conflict — {target.supplier.name}
              {cheapest && <span className="text-destructive"> is the cheapest option</span>}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {cheapest
                ? `At ${target.supplier.costMultiplier.toFixed(2)}× baseline, a cost-first model would pick this supplier. `
                : ""}
              {target.bad.length} of its claims do not survive verification. Each verdict below was computed by a
              named rule from the fields extracted out of the PDFs — change the field, and the verdict changes.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c, i) => (
            <div key={i} className="flex flex-col rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <c.icon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                {/* Keep the pill on one line — "NO CORROBORATION" wrapped inside it
                    and broke the shape next to the shorter labels. */}
                <Badge variant="critical" className="shrink-0 whitespace-nowrap text-[10px]">
                  {c.status}
                </Badge>
              </div>
              {/* A bare domain has no spaces to wrap at and ran past the card edge. */}
              <p className="mt-2 break-words text-sm font-medium">{c.claim}</p>
              <p className="mt-0.5 break-words text-[11px] text-muted-foreground">Claimed via: {c.claimSource}</p>
              <p className="mt-2 text-xs text-foreground">{c.finding}</p>
              {c.confidence !== undefined && (
                <p className="mt-1 text-[11px] text-muted-foreground">Claim confidence: {c.confidence}%</p>
              )}
              {c.rule && (
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">rule: {c.rule}</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-card p-3">
          <p className="text-sm">
            <span className="font-semibold">AegisFlow does not treat these claims as true.</span>{" "}
            <span className="text-muted-foreground">
              An integrity gate caps any supplier with an unresolved conflict at 49/100 — so even with the cost
              weight dragged to maximum, this supplier cannot win the recommendation.
            </span>
          </p>
          <a
            href={`/incidents/${incident.id}/why`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Stress-test the model <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
