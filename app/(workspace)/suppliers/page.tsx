import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getIncident } from "@/lib/incidents/repository";
import { rankSuppliers } from "@/lib/suppliers/ranking";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SuppliersPage() {
  const incident = await getIncident("INC-1042");
  if (!incident) return null;
  const ranked = rankSuppliers(incident);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="mt-1 text-sm text-muted-foreground">Candidate registry for {incident.id}, evaluated with cited evidence.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {ranked.map((r) => (
          <Card key={r.supplier.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{r.supplier.name}</CardTitle>
              <Badge variant={r.rank === 1 ? "success" : r.conflicts > 0 ? "critical" : "muted"}>{r.score}/100</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {r.supplier.location} · {r.supplier.leadTimeDays}-day lead · {r.supplier.costMultiplier.toFixed(2)}× cost
              </p>
              <ul className="space-y-1">
                {r.supplier.claims.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{c.text}</span>
                    <Badge variant={c.status === "VERIFIED" ? "success" : c.status === "CONFLICT" ? "critical" : "warning"}>
                      {c.status}
                    </Badge>
                  </li>
                ))}
              </ul>
              <Link href={`/incidents/${incident.id}/why`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Why this ranking? <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}