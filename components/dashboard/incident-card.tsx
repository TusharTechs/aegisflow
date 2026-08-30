import Link from "next/link";
import { ArrowRight, Clock, DollarSign } from "lucide-react";
import { Incident } from "@/schemas/core";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

export function IncidentCard({ incident }: { incident: Incident }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{incident.supplier} disruption</CardTitle>
          <CardDescription className="mt-1 font-mono text-xs">{incident.id}</CardDescription>
        </div>
        <Badge variant="critical">● Critical</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Affected: <span className="font-medium text-foreground">{incident.affectedProduct}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> Inventory remaining
            </div>
            <div className="mt-1 font-semibold text-warning">{incident.inventoryDays} days</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" /> Revenue exposure
            </div>
            <div className="mt-1 font-semibold text-destructive">{formatCurrency(incident.revenueExposure)}</div>
          </div>
        </div>
        <Link
          href={`/incidents/${incident.id}`}
          className="flex h-9 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Run Response <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}