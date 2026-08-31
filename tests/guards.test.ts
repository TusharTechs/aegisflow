import { describe, expect, it, beforeEach } from "vitest";
import { assertHumanMaySign, humanMaySign, AgentAuthorizationError } from "@/lib/state/guards";
import { getIncident, resetRepository, transitionIncident } from "@/lib/incidents/repository";
import { runInvestigation } from "@/lib/orchestration/investigation";
import { approve, prepareDocuments, signAgreement } from "@/lib/orchestration/actions";

beforeEach(async () => {
  await resetRepository();
});

describe("'your agent shouldn't sign that' guard", () => {
  it("lets a HUMAN sign from SIGNATURE_REQUIRED", () => {
    expect(() => assertHumanMaySign("HUMAN", "SIGNATURE_REQUIRED")).not.toThrow();
    expect(humanMaySign("HUMAN", "SIGNATURE_REQUIRED")).toBe(true);
  });

  it("blocks the AI actor outright", () => {
    expect(() => assertHumanMaySign("AI", "SIGNATURE_REQUIRED")).toThrow(AgentAuthorizationError);
    expect(() => assertHumanMaySign("SYSTEM", "SIGNATURE_REQUIRED")).toThrow(AgentAuthorizationError);
  });

  it("blocks a human signing from the wrong state", () => {
    expect(() => assertHumanMaySign("HUMAN", "INVESTIGATING")).toThrow(AgentAuthorizationError);
    expect(() => assertHumanMaySign("HUMAN", "HUMAN_REVIEW")).toThrow(AgentAuthorizationError);
  });

  it("the state machine itself refuses an AI-actor signature transition", async () => {
    for await (const _ of runInvestigation("INC-1042")) void _;
    await approve("INC-1042");
    await prepareDocuments("INC-1042");
    // The AI has no server action to sign; the raw transition also throws.
    await expect(transitionIncident("INC-1042", "SIGNED", "AI")).rejects.toThrow();
    const incident = await getIncident("INC-1042");
    expect(incident?.state).toBe("SIGNATURE_REQUIRED");
  });

  it("signAgreement without the authorization checkbox is a no-op", async () => {
    for await (const _ of runInvestigation("INC-1042")) void _;
    await approve("INC-1042");
    await prepareDocuments("INC-1042");
    const fd = new FormData();
    fd.set("signerName", "Dana Reyes");
    fd.set("signerTitle", "VP Procurement");
    // no "authorized"
    await signAgreement("INC-1042", fd);
    const incident = await getIncident("INC-1042");
    expect(incident?.state).toBe("SIGNATURE_REQUIRED");
  });
});
