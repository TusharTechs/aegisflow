import { RankedSupplier } from "@/lib/suppliers/ranking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function SupplierComparison({
  ranked,
  showScores,
  externalCounts,
}: {
  ranked: RankedSupplier[];
  showScores: boolean;
  externalCounts?: Record<string, number>;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Alternative suppliers</CardTitle></CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Supplier</th>
              <th className="pb-2 font-medium">Location</th>
              <th className="pb-2 font-medium">Lead time</th>
              <th className="pb-2 font-medium">Cost</th>
              <th className="pb-2 font-medium">Evidence</th>
              {showScores && <th className="pb-2 font-medium">External</th>}
              {showScores && <th className="pb-2 text-right font-medium">Score</th>}
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr
                key={r.supplier.id}
                className={cn("border-b last:border-0", showScores && r.rank === 1 && "bg-accent/40")}
              >
                <td className="py-3 font-medium">
                  {r.supplier.name}
                  {showScores && r.rank === 1 && <Badge variant="success" className="ml-2">Recommended</Badge>}
                  {r.conflicts > 0 && <Badge variant="critical" className="ml-2">Conflict</Badge>}
                </td>
                <td className="py-3 text-muted-foreground">{r.supplier.location}</td>
                <td className="py-3">{r.supplier.leadTimeDays} days</td>
                <td className="py-3">{r.supplier.costMultiplier.toFixed(2)}×</td>
                <td className="py-3 text-muted-foreground">{r.verified}/{r.supplier.claims.length} verified</td>
                {showScores && (
                  <td className="py-3 text-muted-foreground">{externalCounts?.[r.supplier.id] ?? 0} sources</td>
                )}
                {showScores && <td className="py-3 text-right font-semibold">{r.score}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!showScores && (
          <p className="mt-3 text-xs text-muted-foreground">
            Scores and recommendation appear after the response run completes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}