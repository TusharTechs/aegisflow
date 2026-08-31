import { notFound } from "next/navigation";
import { getIncident } from "@/lib/incidents/repository";
import { rankSuppliers } from "@/lib/suppliers/ranking";
import { WhyPanel } from "@/components/evidence/why-panel";

type Props = { params: Promise<{ id: string }> | { id: string } };

export default async function WhyPage({ params }: Props) {
  const { id } = await params;
  const incident = await getIncident(id);
  if (!incident) notFound();
  const ranked = rankSuppliers(incident);

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Why this recommendation?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Transparent risk model for <span className="font-mono">{incident.id}</span>. Every score cites its evidence. Adjust the weights to stress-test the decision.
        </p>
      </div>
      <WhyPanel ranked={ranked} />
    </div>
  );
}