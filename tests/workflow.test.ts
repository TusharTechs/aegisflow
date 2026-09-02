import { describe, expect, it, beforeEach } from "vitest";
import { appendAudit, getIncident, resetRepository, transitionIncident } from "@/lib/incidents/repository";
import { buildContractPayload } from "@/lib/documents/contract";

beforeEach(async () => {
  await resetRepository();
});

describe("workflow + audit", () => {
  it("applies valid transitions", async () => {
    await transitionIncident("INC-1042", "RECOMMENDATION_READY", "AI");
    const incident = await getIncident("INC-1042");
    expect(incident?.state).toBe("RECOMMENDATION_READY");
  });

  it("the AI can never approve or sign", async () => {
    await expect(transitionIncident("INC-1042", "APPROVED", "AI")).rejects.toThrow();
    await expect(transitionIncident("INC-1042", "SIGNED", "AI")).rejects.toThrow();
    const incident = await getIncident("INC-1042");
    expect(incident?.state).toBe("INVESTIGATING");
  });

  it("records audit events with actor and timestamp", async () => {
    await appendAudit("INC-1042", "test event", "HUMAN");
    const incident = await getIncident("INC-1042");
    const last = incident!.auditLog[incident!.auditLog.length - 1];
    expect(last.event).toBe("test event");
    expect(last.actor).toBe("HUMAN");
    expect(last.timestamp).toBeTruthy();
  });

  it("builds a transparent, inspectable contract payload", async () => {
    const incident = await getIncident("INC-1042");
    const nexus = incident!.alternativeSuppliers.find((s) => s.id === "SUP-B")!;
    const payload = buildContractPayload(incident!, nexus);
    expect(payload.unitPrice).toBe(90.3);          // 86 × 1.05
    expect(payload.totalValue).toBe(135450);      // 90.3 × 1500
    expect(payload.deliveryDeadlineDays).toBe(5); // 3-day lead + 2
    expect(payload.compliance).toContain("ISO 9001:2015");
    expect(payload.evidenceSummary.conflicts).toBe(1);
  });
});
describe("a full investigation lands in HUMAN_REVIEW", () => {
  it("chains its own transitions to completion", async () => {
    // Regression: the investigation ends by chaining
    // INVESTIGATING -> RECOMMENDATION_READY -> HUMAN_REVIEW. transitionIncident
    // re-reads the incident on each step, so anything that serves a stale copy
    // mid-chain makes the second hop illegal (INVESTIGATING -> HUMAN_REVIEW is not
    // a valid move) and the run ends silently with the state never advancing —
    // evidence persisted, workflow stuck, "Run Response" still on screen.
    const { runInvestigation } = await import("@/lib/orchestration/investigation");
    for await (const _ of runInvestigation("INC-1042")) void _;

    const incident = await getIncident("INC-1042");
    expect(incident?.state).toBe("HUMAN_REVIEW");
    expect(incident?.decision).toBeTruthy();
    expect((incident?.apiActivity ?? []).length).toBeGreaterThan(0);
  });
});
