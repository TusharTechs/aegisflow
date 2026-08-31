// lib/state/machine.ts
import { WorkflowStateType } from "@/schemas/core";

export const VALID_TRANSITIONS: Record<WorkflowStateType, WorkflowStateType[]> = {
  INVESTIGATING: ["RECOMMENDATION_READY"],
  RECOMMENDATION_READY: ["HUMAN_REVIEW"],
  HUMAN_REVIEW: ["APPROVED", "REJECTED", "INVESTIGATING"], // Human can send back for more evidence
  APPROVED: ["DOCUMENT_PREPARED"],
  DOCUMENT_PREPARED: ["SIGNATURE_REQUIRED"],
  SIGNATURE_REQUIRED: ["SIGNED", "DOCUMENT_PREPARED"],
  SIGNED: [],
  REJECTED: []
};

/**
 * Transitions that only a HUMAN actor may perform. The AI orchestrator and the
 * SYSTEM both advance the workflow *up to* a decision point, then stop — the
 * consequential moves (approve, reject, sign) are reserved for a human, enforced
 * here rather than by convention or prompt.
 */
export const HUMAN_ONLY_TARGETS: WorkflowStateType[] = ["APPROVED", "REJECTED", "SIGNED"];

export function canTransition(from: WorkflowStateType, to: WorkflowStateType): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function requiresHuman(to: WorkflowStateType): boolean {
  return HUMAN_ONLY_TARGETS.includes(to);
}
