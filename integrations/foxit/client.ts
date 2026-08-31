import { getDemoFlags } from "@/lib/orchestration/demo-controls";

// Foxit eSign API (the unified Foxit Document APIs platform).
//
// The SAME client_id / client_secret from developer-api.foxit.com that authenticate
// PDF Services, Document Generation and Embed also authenticate eSign — sent
// directly as headers, no OAuth token to mint or refresh. First use provisions an
// eSign trial account automatically (TEST mode, watermarked envelopes).
//
//   FOXIT_CLIENT_ID       from https://app.developer-api.foxit.com  (API key)
//   FOXIT_CLIENT_SECRET   from the same place                       (API secret)
//   FOXIT_ESIGN_HOST      regional eSign host, default na1
const HOST = (process.env.FOXIT_ESIGN_HOST || "https://na1.foxitesign.foxit.com").replace(/\/$/, "");
export const FOXIT_ESIGN_ENDPOINT = `${HOST}/esign/api/v1/folders/createfolder`;

export function isFoxitConfigured(): boolean {
  return Boolean(process.env.FOXIT_CLIENT_ID && process.env.FOXIT_CLIENT_SECRET);
}

export async function createFoxitSigningSession(opts: {
  documentTitle: string;
  signerName: string;
  signerEmail?: string;
  documentUrl?: string;
}): Promise<{ sessionId: string; status: string }> {
  if (getDemoFlags().foxit) throw new Error("Foxit failure injected for demo");

  const [firstName, ...rest] = opts.signerName.trim().split(/\s+/);
  const payload: Record<string, unknown> = {
    folderName: opts.documentTitle,
    // Prepared under the human's authorization — never auto-sent by the agent.
    sendNow: false,
    parties: [
      {
        firstName: firstName || "Authorized",
        lastName: rest.join(" ") || "Signer",
        emailId: opts.signerEmail || "signer@meridian-mfg.example",
        permission: "FILL_FIELDS_AND_SIGN",
        sequence: 1,
      },
    ],
    processTextTags: false,
  };
  if (opts.documentUrl && /^https?:\/\//.test(opts.documentUrl)) {
    payload.fileUrls = [opts.documentUrl];
    payload.fileNames = ["emergency-supplier-transition-agreement.pdf"];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(FOXIT_ESIGN_ENDPOINT, {
      method: "POST",
      headers: {
        client_id: process.env.FOXIT_CLIENT_ID!,
        client_secret: process.env.FOXIT_CLIENT_SECRET!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Foxit eSign HTTP ${res.status}`);
    const json = await res.json();
    const data = json.data ?? json.result ?? json;
    const sessionId = data.folderId ?? data.id ?? data.folderID ?? json.folderId;
    if (sessionId == null) throw new Error("Unrecognized Foxit eSign response shape");
    return { sessionId: String(sessionId), status: data.status ?? json.status ?? "prepared" };
  } finally {
    clearTimeout(timeout);
  }
}
