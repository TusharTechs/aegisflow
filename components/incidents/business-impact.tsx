import { Clock, DollarSign, Package, Users } from "lucide-react";
import { Incident } from "@/schemas/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export function BusinessImpact({ incident }: { incident: Incident }) {
  const tiles = [
    { icon: Clock, label: "Inventory remaining", value: `${incident.inventoryDays} days`, cls: incident.inventoryDays < 14 ? "text-warning" : "" },
    { icon: DollarSign, label: "Revenue exposure", value: formatCurrency(incident.revenueExposure), cls: "text-destructive" },
    { icon: Package, label: "Affected product", value: incident.affectedProduct, cls: "" },
    { icon: Users, label: "Customer impact", value: "Assessment pending", cls: "text-muted-foreground" },
  ];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Business impact</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </div>
            <div className={`mt-1.5 text-sm font-semibold ${t.cls}`}>{t.value}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}