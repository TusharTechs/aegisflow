import { describe, expect, it, beforeEach } from "vitest";
import { getIncident, resetRepository } from "@/lib/incidents/repository";
import { runInvestigation } from "@/lib/orchestration/investigation";
import { prepareDocuments, approve, signAgreement } from "@/lib/orchestration/actions";
import { setDemoFlag } from "@/lib/orchestration/demo-controls";
import type { ApiCall } from "@/schemas/core";

const SPONSORS = ["serpapi", "nutrient", "doctavian", "foxit", "gemini"] as const;

async function drain(id: string) {
  for await (const _ of runInvestigation(id)) void _;
}

beforeEach(async () => {
  SPONSORS.forEach((k) => setDemoFlag(k, false));
  await resetRepository();
});

describe("integration activity ledger", () => {
  it("records a call for every sponsor API touched during an investigation", async () => {
    await drain("INC-1042");
    const incident = await getIncident("INC-1042");
    const activity = incident?.apiActivity ?? [];

    const sponsors = new Set(activity.map((c) => c.sponsor));
    expect(sponsors).toContain("SerpApi");
    expect(sponsors).toContain("Nutrient");
    expect(sponsors).toContain("Gemini");
    expect(sponsors).toContain("Xano");

    // 5 web queries + 6 documents + 2 gemini calls + 1 persist = 14
    expect(activity.length).toBeGreaterThanOrEqual(12);
  });

  it("every ledger entry carries a real request, response, mode and status", async () => {
    await drain("INC-1042");
    const activity = (await getIncident("INC-1042"))?.apiActivity ?? [];
    for (const call of activity as ApiCall[]) {
      expect(call.request).toBeDefined();
      expect(call.response).toBeDefined();
      expect(["LIVE", "LOCAL", "DEMO SEEDED"]).toContain(call.mode);
      expect(["ok", "fallback", "error"]).toContain(call.status);
      expect(call.endpoint.length).toBeGreaterThan(0);
    }
  });

  it("with no keys set, no entry is falsely marked LIVE", async () => {
    await drain("INC-1042");
    const activity = (await getIncident("INC-1042"))?.apiActivity ?? [];
    expect(activity.every((c) => c.mode !== "LIVE")).toBe(true);
  });

  it("SerpApi zero-corroboration is recorded, not silently dropped", async () => {
    await drain("INC-1042");
    const activity = (await getIncident("INC-1042"))?.apiActivity ?? [];
    const serp = activity.filter((c) => c.sponsor === "SerpApi");
    expect(serp.length).toBeGreaterThanOrEqual(5);
  });

  it("Doctavian, Nutrient-watermark and Foxit calls are appended during the human-authorized steps", async () => {
    await drain("INC-1042");
    await approve("INC-1042");
    await prepareDocuments("INC-1042");

    let activity = (await getIncident("INC-1042"))?.apiActivity ?? [];
    expect(activity.some((c) => c.sponsor === "Doctavian")).toBe(true);
    expect(activity.some((c) => c.sponsor === "Nutrient" && c.operation.includes("watermark"))).toBe(true);

    const fd = new FormData();
    fd.set("signerName", "Dana Reyes");
    fd.set("signerTitle", "VP Procurement");
    fd.set("authorized", "on");
    await signAgreement("INC-1042", fd);

    activity = (await getIncident("INC-1042"))?.apiActivity ?? [];
    expect(activity.some((c) => c.sponsor === "Foxit")).toBe(true);

    const incident = await getIncident("INC-1042");
    expect(incident?.state).toBe("SIGNED");
    expect(incident?.signature?.signerName).toBe("Dana Reyes");
  });
});
