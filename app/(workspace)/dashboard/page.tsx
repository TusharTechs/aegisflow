import { listIncidents } from "@/lib/incidents/repository";
import { IncidentCard } from "@/components/dashboard/incident-card";

export default async function DashboardPage() {
  const incidents = await listIncidents();
  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Critical procurement incidents requiring response.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {incidents.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} />
        ))}
      </div>
    </div>
  );
}