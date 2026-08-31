import { describe, expect, it, beforeEach } from "vitest";
import { z } from "zod";
import { setDemoFlag } from "@/lib/orchestration/demo-controls";
import { serpSearch } from "@/integrations/serpapi/client";
import { extractTextViaNutrient } from "@/integrations/nutrient/client";
import { generateStructured } from "@/lib/ai/gemini";
import { runWebIntelligence } from "@/lib/agents/web-intelligence";
import { fixture } from "./fixtures";

const ALL = ["serpapi", "nutrient", "doctavian", "foxit", "gemini"] as const;

beforeEach(() => {
  ALL.forEach((k) => setDemoFlag(k, false));
});

describe("graceful degradation", () => {
  it("serpSearch throws on injected failure", async () => {
    setDemoFlag("serpapi", true);
    await expect(serpSearch("test query")).rejects.toThrow();
  });

  it("web intelligence falls back to seeded sources and completes", async () => {
    setDemoFlag("serpapi", true);
    const report = await runWebIntelligence(fixture());
    expect(report.liveCount).toBe(0);
    expect(report.sources.length).toBeGreaterThanOrEqual(10);
    expect(report.sources.every((s) => s.mode === "DEMO SEEDED")).toBe(true);
  });

  it("nutrient throws on injected failure", async () => {
    setDemoFlag("nutrient", true);
    await expect(extractTextViaNutrient(Buffer.from("x"), "f.pdf")).rejects.toThrow();
  });

  it("gemini returns a Zod-validated fallback when disabled", async () => {
    setDemoFlag("gemini", true);
    const res = await generateStructured({
      schema: z.object({ summary: z.string() }),
      prompt: "irrelevant",
      fallback: { summary: "fallback summary" },
    });
    expect(res.source).toBe("fallback");
    expect(res.value.summary).toBe("fallback summary");
  });
});