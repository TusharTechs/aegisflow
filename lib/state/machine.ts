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

export function canTransition(from: WorkflowStateType, to: WorkflowStateType): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}