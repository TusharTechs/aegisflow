import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

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
}): Promise<AiResult<T>> {
  const gemini = getGemini();
  if (!gemini) return { value: opts.fallback, source: "fallback" };
  try {
    const model = gemini.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    });
    const res = await model.generateContent(opts.prompt);
    const parsed = opts.schema.safeParse(JSON.parse(res.response.text()));
    if (!parsed.success) return { value: opts.fallback, source: "fallback" };
    return { value: parsed.data, source: "gemini" };
  } catch {
    return { value: opts.fallback, source: "fallback" };
  }
}