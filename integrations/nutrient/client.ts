import { getDemoFlags } from "@/lib/orchestration/demo-controls";

export const NUTRIENT_EXTRACT_ENDPOINT = "https://api.nutrient.io/extract-text";
export const NUTRIENT_BUILD_ENDPOINT = "https://api.nutrient.io/build";

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
    const res = await fetch(NUTRIENT_EXTRACT_ENDPOINT, {
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

/**
 * Second Nutrient DWS touchpoint: stamp the generated agreement with a
 * "PENDING HUMAN SIGNATURE" watermark before it is ever shown to a human.
 * Documents Nutrient is used on both ends of the workflow — ingestion and output.
 */
export interface WatermarkInstructions {
  text: string;
  documentTitle: string;
}

export async function watermarkViaNutrient(
  bytes: Buffer,
  instructions: WatermarkInstructions
): Promise<Buffer> {
  if (getDemoFlags().nutrient) throw new Error("Nutrient failure injected for demo");
  const key = process.env.NUTRIENT_API_KEY!;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), "agreement.pdf");
  form.append(
    "instructions",
    JSON.stringify({
      parts: [{ file: "file" }],
      actions: [
        {
          type: "watermark",
          text: instructions.text,
          width: { value: 60, unit: "%" },
          height: { value: 20, unit: "%" },
          opacity: 0.18,
          rotation: 45,
        },
      ],
    })
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(NUTRIENT_BUILD_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Nutrient HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}
