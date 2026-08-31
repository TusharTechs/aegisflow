import { WorkflowStateType } from "@/schemas/core";

/**
 * "Your agent shouldn't sign that."
 *
 * A named, testable guard invoked on every path that could create a signature or
 * an eSign session. It refuses to proceed unless the caller is a human actor and
 * the workflow is at the one state where a signature is valid. The AI orchestrator
 * has no code path that satisfies both conditions — by construction, not by prompt.
 */
export class AgentAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentAuthorizationError";
  }
}

export function assertHumanMaySign(actor: "SYSTEM" | "AI" | "HUMAN", state: WorkflowStateType): void {
  if (actor !== "HUMAN") {
    throw new AgentAuthorizationError(
      `Blocked: a ${actor} actor attempted to authorize a signature. Only a HUMAN actor may sign.`
    );
  }
  if (state !== "SIGNATURE_REQUIRED") {
    throw new AgentAuthorizationError(
      `Blocked: signature attempted from state ${state}. Signing is only valid from SIGNATURE_REQUIRED.`
    );
  }
}

/** True when signing is permitted for this actor + state (no throw). */
export function humanMaySign(actor: "SYSTEM" | "AI" | "HUMAN", state: WorkflowStateType): boolean {
  try {
    assertHumanMaySign(actor, state);
    return true;
  } catch {
    return false;
  }
}
