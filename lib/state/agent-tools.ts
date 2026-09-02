import { WorkflowStateType } from "@/schemas/core";
import { AgentAuthorizationError } from "./guards";

/**
 * "Your agent shouldn't sign that."
 *
 * Foxit draws a deliberate line: their MCP server exposes ~40 PDF operations as
 * agent tools, and signing is not one of them. To put a document in front of a
 * signer, code has to leave the tool sandbox and call the eSign API directly, with
 * its own separately-issued credentials.
 *
 * That line is an API-design opinion. This module turns it into an enforced
 * property of the application: every document operation AegisFlow can perform is
 * registered here with the risk class it belongs to and the actors allowed to
 * invoke it. Reversible work — generate, extract, watermark, render — the agent
 * does alone. Irreversible work is reachable only by a HUMAN actor, from exactly
 * one workflow state.
 *
 * The registry is the authority, not a convention: `assertToolAllowed` is called
 * on the path to the operation, and there is no entry an AI actor can use to reach
 * an eSign folder or a signature.
 */

export type Actor = "SYSTEM" | "AI" | "HUMAN";

export type ToolRisk =
  /** Produces an artefact. Re-runnable, discardable, commits the business to nothing. */
  | "REVERSIBLE"
  /** Creates an external obligation or a legal act. Cannot be taken back by re-running. */
  | "IRREVERSIBLE";

export interface AgentTool {
  id: string;
  surface: "foxit-esign" | "foxit-pdf-services" | "nutrient-dws" | "doctavian" | "internal";
  description: string;
  risk: ToolRisk;
  allowedActors: Actor[];
  /** Irreversible tools are valid from exactly one state. */
  requiredState?: WorkflowStateType;
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    id: "document.extract",
    surface: "nutrient-dws",
    description: "Extract text and fields from a supplier PDF.",
    risk: "REVERSIBLE",
    allowedActors: ["SYSTEM", "AI", "HUMAN"],
  },
  {
    id: "document.generate",
    surface: "doctavian",
    description: "Render the Emergency Supplier Transition Agreement from the decision payload.",
    risk: "REVERSIBLE",
    allowedActors: ["SYSTEM", "AI", "HUMAN"],
  },
  {
    id: "document.watermark",
    surface: "nutrient-dws",
    description: "Stamp the generated agreement PENDING HUMAN SIGNATURE.",
    risk: "REVERSIBLE",
    allowedActors: ["SYSTEM", "AI", "HUMAN"],
  },
  {
    id: "document.inspect",
    surface: "foxit-pdf-services",
    description: "Read structure and metadata from a generated PDF — the class of work the Foxit MCP server exposes.",
    risk: "REVERSIBLE",
    allowedActors: ["SYSTEM", "AI", "HUMAN"],
  },
  {
    // Deliberately absent from the Foxit MCP tool catalogue, and gated here too.
    id: "esign.createFolder",
    surface: "foxit-esign",
    description: "Create the Foxit eSign folder that puts the agreement in front of a signer.",
    risk: "IRREVERSIBLE",
    allowedActors: ["HUMAN"],
    requiredState: "SIGNATURE_REQUIRED",
  },
];

export function getTool(id: string): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.id === id);
}

/** Every tool an autonomous actor is free to invoke without asking anyone. */
export function reversibleTools(): AgentTool[] {
  return AGENT_TOOLS.filter((t) => t.risk === "REVERSIBLE");
}

/** Every tool that requires a human to be in the loop. */
export function irreversibleTools(): AgentTool[] {
  return AGENT_TOOLS.filter((t) => t.risk === "IRREVERSIBLE");
}

/**
 * The enforcement point. Throws unless this actor may invoke this tool from this
 * state. Called on the path to the operation itself, so there is no way to reach
 * the API while bypassing it.
 */
export function assertToolAllowed(toolId: string, actor: Actor, state: WorkflowStateType): void {
  const tool = getTool(toolId);
  if (!tool) {
    throw new AgentAuthorizationError(`Blocked: "${toolId}" is not a registered tool.`);
  }
  if (!tool.allowedActors.includes(actor)) {
    throw new AgentAuthorizationError(
      `Blocked: a ${actor} actor attempted "${tool.id}" (${tool.risk}). ` +
        `Permitted actors: ${tool.allowedActors.join(", ")}.`
    );
  }
  if (tool.requiredState && state !== tool.requiredState) {
    throw new AgentAuthorizationError(
      `Blocked: "${tool.id}" attempted from state ${state}. Valid only from ${tool.requiredState}.`
    );
  }
}

/** Non-throwing form, for rendering UI affordances. */
export function toolAllowed(toolId: string, actor: Actor, state: WorkflowStateType): boolean {
  try {
    assertToolAllowed(toolId, actor, state);
    return true;
  } catch {
    return false;
  }
}
