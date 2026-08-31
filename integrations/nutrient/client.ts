import { getDemoFlags } from "@/lib/orchestration/demo-controls";

export function isNutrientConfigured(): boolean {
  return Boolean(process.env.NUTRIENT_API_KEY);
}

export async function extractTextViaNutrient(bytes: Buffer, filename: string): Promise<string> {
  if (getDemoFlags().nutrient) throw new Error("Nutrient failure injected for demo");
  const key = process.env.NUTRIENT_API_KEY!;
  const form = new FormData();
  // Copy into a fresh Uint8Array: Buffer<ArrayBufferLike> is not a valid BlobPart in TS 5.7+
  form.append("file", new Blob([new Uint8Array(bytes)]), filename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("https://api.nutrient.io/extract-text", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Nutrient HTTP ${res.status}`);
    const json = await res.json();
    if (Array.isArray(json.pages)) return json.pages.map((p: { text?: string }) => p.text ?? "").join("\n");
    if (typeof json.text === "string") return json.text;
    throw new Error("Unrecognized Nutrient response shape");
  } finally {
    clearTimeout(timeout);
  }
}