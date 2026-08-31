import { describe, expect, it } from "vitest";
import { canTransition } from "@/lib/state/machine";

describe("workflow state machine", () => {
  it("allows the happy path", () => {
    const path = [
      "INVESTIGATING", "RECOMMENDATION_READY", "HUMAN_REVIEW",
      "APPROVED", "DOCUMENT_PREPARED", "SIGNATURE_REQUIRED", "SIGNED",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("blocks shortcuts and post-terminal moves", () => {
    expect(canTransition("INVESTIGATING", "APPROVED")).toBe(false);
    expect(canTransition("HUMAN_REVIEW", "DOCUMENT_PREPARED")).toBe(false);
    expect(canTransition("SIGNATURE_REQUIRED", "APPROVED")).toBe(false);
    expect(canTransition("SIGNED", "INVESTIGATING")).toBe(false);
    expect(canTransition("REJECTED", "APPROVED")).toBe(false);
  });
});