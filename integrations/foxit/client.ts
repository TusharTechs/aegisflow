import { getDemoFlags } from "@/lib/orchestration/demo-controls";

export const FOXIT_ESIGN_ENDPOINT = "https://api.foxit.com/esign/v1/signing-requests";

export function isFoxitConfigured(): boolean {
  return Boolean(process.env.FOXIT_API_KEY);
}

export async function createFoxitSigningSession(opts: {
  documentTitle: string;
  signerName: string;
}): Promise<{ sessionId: string }> {
  if (getDemoFlags().foxit) throw new Error("Foxit failure injected for demo");
  const key = process.env.FOXIT_API_KEY!;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(FOXIT_ESIGN_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: opts.documentTitle, signers: [{ name: opts.signerName }] }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Foxit HTTP ${res.status}`);
    const json = await res.json();
    const sessionId = json.id ?? json.session_id ?? json.signing_request_id;
    if (typeof sessionId !== "string") throw new Error("Unrecognized Foxit response shape");
    return { sessionId };
  } finally {
    clearTimeout(timeout);
  }
}