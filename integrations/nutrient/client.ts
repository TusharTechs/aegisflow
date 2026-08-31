import { getDemoFlags } from "@/lib/orchestration/demo-controls";

// Nutrient DWS Processor API — one endpoint, document-in / document-out.
// https://api.nutrient.io/build  ·  Authorization: Bearer <PROCESSOR_API_KEY>
export const NUTRIENT_BUILD_ENDPOINT = "https://api.nutrient.io/build";
// Kept as a distinct label for the ledger; same endpoint, different instructions.
export const NUTRIENT_EXTRACT_ENDPOINT = "https://api.nutrient.io/build";

export function isNutrientConfigured(): boolean {
  return Boolean(process.env.NUTRIENT_API_KEY);
}

/** DWS json-content / markdown / text responses vary in shape — pull text from any of them. */
function pickText(json: unknown): string {
  if (typeof json === "string") return json;
  if (!json || typeof json !== "object") return "";
  const j = json as Record<string, unknown>;
  if (typeof j.markdown === "string") return j.markdown;
  if (typeof j.plainText === "string") return j.plainText;
  if (typeof j.text === "string") return j.text;
  if (Array.isArray(j.pages)) {
    return j.pages
      .map((p) => {
        const pg = p as Record<string, unknown>;
        if (typeof pg.plainText === "string") return pg.plainText;
        if (typeof pg.markdown === "string") return pg.markdown;
        if (typeof pg.text === "string") return pg.text;
        if (Array.isArray(pg.content)) {
          return pg.content
            .map((c) => {
              const el = c as Record<string, unknown>;
              return typeof el.text === "string" ? el.text : typeof el.value === "string" ? el.value : "";
            })
            .join(" ");
        }
        return "";
      })
      .join("\n");
  }
  if (Array.isArray(j.content)) {
    return j.content.map((c) => (c as Record<string, unknown>).text ?? "").join(" ");
  }
  return "";
}

/**
 * Text + structured extraction via the Processor API `/build` endpoint with a
 * `json-content` output. Claims' provenance points back to the fields this pulls.
 */
export async function extractTextViaNutrient(bytes: Buffer, filename: string): Promise<string> {
  if (getDemoFlags().nutrient) throw new Error("Nutrient failure injected for demo");
  const key = process.env.NUTRIENT_API_KEY!;
  const form = new FormData();
  // Copy into a fresh Uint8Array: Buffer<ArrayBufferLike> is not a valid BlobPart in TS 5.7+
  form.append("document", new Blob([new Uint8Array(bytes)]), filename);
  form.append(
    "instructions",
    JSON.stringify({
      parts: [{ file: "document" }],
      output: { type: "json-content", plainText: true, tables: true },
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
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Nutrient HTTP ${res.status}${detail ? ` — ${detail.slice(0, 160)}` : ""}`);
    }
    const json = await res.json();
    const text = pickText(json);
    if (text && text.trim()) return text;
    throw new Error("Nutrient returned no extractable text");
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
  form.append("document", new Blob([new Uint8Array(bytes)]), "agreement.pdf");
  form.append(
    "instructions",
    JSON.stringify({
      parts: [{ file: "document" }],
      actions: [
        {
          type: "watermark",
          text: instructions.text,
          width: { value: 400, unit: "pt" },
          height: { value: 120, unit: "pt" },
          opacity: 0.18,
          rotation: 45,
          fontColor: "#DC2626",
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
