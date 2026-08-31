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

/** Read the text output across SDK versions / thinking models (skip `thought` parts). */
function readText(res: { response: { text?: () => string; candidates?: unknown[] } }): string {
  const cands = res.response.candidates as
    | Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
    | undefined;
  const fromParts = cands?.[0]?.content?.parts
    ?.filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (fromParts && fromParts.trim()) return fromParts;
  try {
    return res.response.text?.() ?? "";
  } catch {
    return "";
  }
}

/** Tolerate markdown fences and leading/trailing prose around the JSON object. */
function parseLenientJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export async function generateStructured<T>(opts: {
  schema: z.ZodType<T>;
  prompt: string;
  fallback: T;
  ledger?: ActivityLedger;
  operation?: string;
}): Promise<AiResult<T>> {
  const modelName = process.env.GEMINI_MODEL || "gemini-flash-latest";
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
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
        // Gemini 3.x models "think" by default; the reasoning text leaks into
        // the response and breaks strict JSON parsing. Turn it off.
        ...({ thinkingConfig: { thinkingBudget: 0 } } as Record<string, unknown>),
      },
    });
    const res = await model.generateContent(opts.prompt);
    const raw = readText(res);
    const json = parseLenientJson(raw);
    const parsed = json === undefined ? { success: false as const } : opts.schema.safeParse(json);
    if (!parsed.success) {
      log("fallback", "Gemini response failed Zod validation — deterministic fallback used.", raw.slice(0, 500));
      return { value: opts.fallback, source: "fallback" };
    }
    log("gemini", "Response Zod-validated before use.", parsed.data);
    return { value: parsed.data, source: "gemini" };
  } catch (err) {
    log("fallback", `Gemini call failed (${err instanceof Error ? err.message : "unknown"}) — deterministic fallback used.`, opts.fallback);
    return { value: opts.fallback, source: "fallback" };
  }
}