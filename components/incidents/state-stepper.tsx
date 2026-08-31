import { WorkflowStateType } from "@/schemas/core";
import { cn } from "@/lib/utils";

const STEPS: WorkflowStateType[] = [
  "INVESTIGATING", "RECOMMENDATION_READY", "HUMAN_REVIEW",
  "APPROVED", "DOCUMENT_PREPARED", "SIGNATURE_REQUIRED", "SIGNED",
];

const LABELS: Record<string, string> = {
  INVESTIGATING: "Investigating",
  RECOMMENDATION_READY: "Recommendation ready",
  HUMAN_REVIEW: "Human review",
  APPROVED: "Approved",
  DOCUMENT_PREPARED: "Document prepared",
  SIGNATURE_REQUIRED: "Signature required",
  SIGNED: "Signed",
};

export function StateStepper({ state }: { state: WorkflowStateType }) {
  if (state === "REJECTED") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        Recommendation rejected by human reviewer.
      </div>
    );
  }
  const idx = STEPS.indexOf(state);
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              i < idx && "border-success/40 bg-success/10 text-success",
              i === idx && "border-primary bg-primary text-primary-foreground",
              i > idx && "border-border text-muted-foreground"
            )}
          >
            {LABELS[s]}
          </span>
          {i < STEPS.length - 1 && <span className="h-px w-3 bg-border" />}
        </li>
      ))}
    </ol>
  );
}