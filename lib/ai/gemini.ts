import { getDemoFlags } from "@/lib/orchestration/demo-controls";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import type { ActivityLedger } from "@/lib/integrations/ledger";

let client: GoogleGenerativeAI | null | undefined;

export function getGemini(): GoogleGenerativeAI | null {
  if (client === undefined) {
    const key = process.env.GEMINI_API_KEY;
    client = key ? new GoogleGenerativeAI(key) : null;
  }
  return client;
}

export interface AiResult<T> {
  value: T;
  source: "gemini" | "fallback";
}

export async function generateStructured<T>(opts: {
  schema: z.ZodType<T>;
  prompt: string;
  fallback: T;
  ledger?: ActivityLedger;
  operation?: string;
}): Promise<AiResult<T>> {
  const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const start = Date.now();
  const log = (source: "gemini" | "fallback", note: string, response: unknown) => {
    opts.ledger?.record({
      sponsor: "Gemini",
      operation: opts.operation ?? "generateContent",
      method: "POST",
      endpoint: `models/${modelName}:generateContent`,
      request: { model: modelName, responseMimeType: "application/json", temperature: 0.2, prompt: opts.prompt },
      response,
      mode: source === "gemini" ? "LIVE" : "LOCAL",
      status: source === "gemini" ? "ok" : "fallback",
      ms: Date.now() - start,
      note,
    });
  };

  if (getDemoFlags().gemini) {
    log("fallback", "Gemini disabled via demo control — deterministic interpretation used.", opts.fallback);
    return { value: opts.fallback, source: "fallback" };
  }
  const gemini = getGemini();
  if (!gemini) {
    log("fallback", "GEMINI_API_KEY not configured — deterministic interpretation used.", opts.fallback);
    return { value: opts.fallback, source: "fallback" };
  }
  try {
    const model = gemini.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    });
    const res = await model.generateContent(opts.prompt);
    const parsed = opts.schema.safeParse(JSON.parse(res.response.text()));
    if (!parsed.success) {
      log("fallback", "Gemini response failed Zod validation — deterministic fallback used.", res.response.text());
      return { value: opts.fallback, source: "fallback" };
    }
    log("gemini", "Response Zod-validated before use.", parsed.data);
    return { value: parsed.data, source: "gemini" };
  } catch (err) {
    log("fallback", `Gemini call failed (${err instanceof Error ? err.message : "unknown"}) — deterministic fallback used.`, opts.fallback);
    return { value: opts.fallback, source: "fallback" };
  }
}