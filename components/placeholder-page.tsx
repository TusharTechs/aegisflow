export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        This view is wired in a later phase.
      </div>
    </div>
  );
}