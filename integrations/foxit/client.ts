import { getDemoFlags } from "@/lib/orchestration/demo-controls";

// Foxit eSign API. This is a SEPARATE product from the Foxit Document APIs
// (developer-api.foxit.com). It has its own portal — foxitesign.foxit.com — and
// its own credentials: an API Key + API Secret that you exchange, via OAuth2
// client-credentials, for a short-lived bearer access token.
//
//   FOXIT_ESIGN_CLIENT_ID     = API Key   (from the eSign portal → Integrations/API)
//   FOXIT_ESIGN_CLIENT_SECRET = API Secret
//   FOXIT_ESIGN_HOST          = regional host, default https://na1.foxitesign.foxit.com
const HOST = (process.env.FOXIT_ESIGN_HOST || "https://na1.foxitesign.foxit.com").replace(/\/$/, "");
export const FOXIT_ESIGN_TOKEN_ENDPOINT = `${HOST}/api/oauth2/access_token`;
export const FOXIT_ESIGN_ENDPOINT = `${HOST}/api/folders/createfolder`;

export function isFoxitConfigured(): boolean {
  return Boolean(process.env.FOXIT_ESIGN_CLIENT_ID && process.env.FOXIT_ESIGN_CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getFoxitAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.FOXIT_ESIGN_CLIENT_ID!,
    client_secret: process.env.FOXIT_ESIGN_CLIENT_SECRET!,
    scope: "read-write",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(FOXIT_ESIGN_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Foxit eSign OAuth HTTP ${res.status}`);
    const json = await res.json();
    if (typeof json.access_token !== "string") throw new Error("No access_token in Foxit OAuth response");
    cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return cachedToken.token;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createFoxitSigningSession(opts: {
  documentTitle: string;
  signerName: string;
  signerEmail?: string;
  documentUrl?: string;
}): Promise<{ sessionId: string; status: string }> {
  if (getDemoFlags().foxit) throw new Error("Foxit failure injected for demo");

  const token = await getFoxitAccessToken();
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
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Foxit eSign HTTP ${res.status}`);
    const json = await res.json();
    const sessionId =
      json.folderId ?? json.id ?? json.data?.folderId ?? json.data?.id ?? json.result?.folderId;
    if (sessionId == null) throw new Error("Unrecognized Foxit eSign response shape");
    return { sessionId: String(sessionId), status: json.status ?? "prepared" };
  } finally {
    clearTimeout(timeout);
  }
}
