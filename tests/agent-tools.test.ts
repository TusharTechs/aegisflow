import { describe, expect, it } from "vitest";
import {
  AGENT_TOOLS,
  assertToolAllowed,
  irreversibleTools,
  reversibleTools,
  toolAllowed,
  type Actor,
} from "@/lib/state/agent-tools";
import { AgentAuthorizationError } from "@/lib/state/guards";
import { WorkflowState } from "@/schemas/core";

const ACTORS: Actor[] = ["SYSTEM", "AI", "HUMAN"];
const ALL_STATES = WorkflowState.options;

describe("the agent tool boundary", () => {
  it("lets an AI actor do all the reversible document work on its own", () => {
    for (const tool of reversibleTools()) {
      expect(() => assertToolAllowed(tool.id, "AI", "INVESTIGATING")).not.toThrow();
    }
  });

  it("gives the AI no path to an eSign folder — from ANY state", () => {
    for (const state of ALL_STATES) {
      expect(() => assertToolAllowed("esign.createFolder", "AI", state)).toThrow(AgentAuthorizationError);
      expect(() => assertToolAllowed("esign.createFolder", "SYSTEM", state)).toThrow(AgentAuthorizationError);
    }
  });

  it("permits the human exactly one state to sign from, and no other", () => {
    const allowed = ALL_STATES.filter((s) => toolAllowed("esign.createFolder", "HUMAN", s));
    expect(allowed).toEqual(["SIGNATURE_REQUIRED"]);
  });

  it("exhaustively: no non-human actor can reach any irreversible tool", () => {
    const reachable = irreversibleTools().flatMap((tool) =>
      ACTORS.filter((a) => a !== "HUMAN").flatMap((actor) =>
        ALL_STATES.filter((state) => toolAllowed(tool.id, actor, state)).map(
          (state) => `${actor}:${tool.id}@${state}`
        )
      )
    );
    expect(reachable).toEqual([]);
  });

  it("refuses tools that are not registered at all", () => {
    expect(() => assertToolAllowed("esign.sendNow", "HUMAN", "SIGNATURE_REQUIRED")).toThrow(
      /not a registered tool/
    );
  });

  it("classifies eSign as the only irreversible surface", () => {
    expect(irreversibleTools().map((t) => t.id)).toEqual(["esign.createFolder"]);
    expect(irreversibleTools().every((t) => t.surface === "foxit-esign")).toBe(true);
  });

  it("every irreversible tool names both a human-only actor list and a required state", () => {
    for (const tool of irreversibleTools()) {
      expect(tool.allowedActors).toEqual(["HUMAN"]);
      expect(tool.requiredState).toBeTruthy();
    }
  });

  it("explains why it blocked, naming the actor and the risk class", () => {
    try {
      assertToolAllowed("esign.createFolder", "AI", "SIGNATURE_REQUIRED");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("AI");
      expect((err as Error).message).toContain("IRREVERSIBLE");
    }
  });

  it("registers every tool with a surface and a description", () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.surface).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});
