import { getDemoFlags } from "@/lib/orchestration/demo-controls";

export const DOCTAVIAN_GENERATE_ENDPOINT = "https://api.doctavian.com/v1/documents/generate";

export function isDoctavianConfigured(): boolean {
  return Boolean(process.env.DOCTAVIAN_API_KEY);
}

export async function generateViaDoctavian(payload: unknown): Promise<{ url: string }> {
  if (getDemoFlags().doctavian) throw new Error("Doctavian failure injected for demo");
  const key = process.env.DOCTAVIAN_API_KEY!;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(DOCTAVIAN_GENERATE_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: process.env.DOCTAVIAN_TEMPLATE_ID ?? "emergency-transition-agreement",
        variables: payload,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Doctavian HTTP ${res.status}`);
    const json = await res.json();
    const url = json.url ?? json.download_url ?? json.document_url;
    if (typeof url !== "string") throw new Error("Unrecognized Doctavian response shape");
    return { url };
  } finally {
    clearTimeout(timeout);
  }
}