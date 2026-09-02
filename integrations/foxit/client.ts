import { getDemoFlags } from "@/lib/orchestration/demo-controls";

/**
 * Foxit eSign API.
 *
 * This is a SEPARATE product from the Foxit Document APIs at
 * developer-api.foxit.com, and the distinction is load-bearing for this project.
 * Foxit's own guidance is explicit: the credentials are isolated by design, and
 * signing is deliberately excluded from the Foxit MCP server's tool catalogue —
 * an agent can reach ~40 reversible PDF operations, but to put something in front
 * of a signer it has to leave the tool sandbox and call eSign directly.
 *
 * AegisFlow treats that boundary as the product thesis rather than an obstacle.
 * See `lib/state/agent-tools.ts` for the boundary in code.
 *
 *   FOXIT_ESIGN_CLIENT_ID     = API Key    (account.foxit.com → eSign portal)
 *   FOXIT_ESIGN_CLIENT_SECRET = API Secret (same place)
 *   FOXIT_ESIGN_HOST          = regional host, default https://na1.foxitesign.foxit.com
 *
 * NOTE: the PDF Services `FOXIT_CLIENT_ID` / `FOXIT_CLIENT_SECRET` pair does NOT
 * authenticate here. Sending them returns `invalid_client` from the token
 * endpoint — verified against the live API.
 */
const HOST = (process.env.FOXIT_ESIGN_HOST || "https://na1.foxitesign.foxit.com").replace(/\/$/, "");
export const FOXIT_ESIGN_TOKEN_ENDPOINT = `${HOST}/api/oauth2/access_token`;
export const FOXIT_ESIGN_ENDPOINT = `${HOST}/api/folders/createfolder`;

export function isFoxitConfigured(): boolean {
  return Boolean(process.env.FOXIT_ESIGN_CLIENT_ID && process.env.FOXIT_ESIGN_CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Exposed for tests — a cached bearer must not leak across credential changes. */
export function resetFoxitTokenCache(): void {
  cachedToken = null;
}

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
    const json = await res.json().catch(() => null);
    // The token endpoint answers 200 with an OAuth error body for bad credentials,
    // so status alone is not enough to tell success from failure.
    if (!res.ok || !json || typeof json.access_token !== "string") {
      const reason = json?.error_description ?? json?.error ?? `HTTP ${res.status}`;
      throw new Error(`Foxit eSign OAuth failed: ${reason}`);
    }
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
    processTextTags: false,
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
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Foxit eSign HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
    }
    const json = await res.json();
    const data = json.data ?? json.result ?? json;
    const sessionId = data.folderId ?? data.id ?? data.folderID ?? json.folderId;
    if (sessionId == null) throw new Error("Unrecognized Foxit eSign response shape");
    return { sessionId: String(sessionId), status: data.status ?? json.status ?? "prepared" };
  } finally {
    clearTimeout(timeout);
  }
}
