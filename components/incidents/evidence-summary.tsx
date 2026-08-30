import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { Incident } from "@/schemas/core";

export function EvidenceSummary({ incident }: { incident: Incident }) {
  const claims = incident.alternativeSuppliers.flatMap((s) => s.claims);
  const tiles = [
    { label: "Verified claims", value: claims.filter((c) => c.status === "VERIFIED").length, icon: CheckCircle2, cls: "text-success" },
    { label: "Conflicts", value: claims.filter((c) => c.status === "CONFLICT").length, icon: AlertTriangle, cls: "text-destructive" },
    { label: "Unverified", value: claims.filter((c) => c.status === "UNVERIFIED").length, icon: HelpCircle, cls: "text-warning" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <t.icon className={`h-3.5 w-3.5 ${t.cls}`} /> {t.label}
          </div>
          <div className={`mt-2 text-2xl font-semibold ${t.cls}`}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}