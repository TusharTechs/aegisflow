// Doctavian document-generation API. The adapter sends the structured contract
// payload as template variables and throws on any failure so the caller falls
// back to the honest local render.

export function isDoctavianConfigured(): boolean {
  return Boolean(process.env.DOCTAVIAN_API_KEY);
}

export async function generateViaDoctavian(payload: unknown): Promise<{ url: string }> {
  const key = process.env.DOCTAVIAN_API_KEY!;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("https://api.doctavian.com/v1/documents/generate", {
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