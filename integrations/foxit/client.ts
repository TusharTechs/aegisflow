import { getDemoFlags } from "@/lib/orchestration/demo-controls";

/**
 * Foxit eSign, on the unified Foxit Document APIs platform.
 *
 * Worth being precise, because Foxit ships eSign two ways and the docs for one do
 * not describe the other:
 *
 *   - The standalone eSign product (foxitesign.foxit.com) has its own portal, its
 *     own API Key/Secret, and an OAuth2 client-credentials token exchange.
 *   - The unified platform (developer-api.foxit.com) provisions eSign for the
 *     account and serves it from `na1.fusion.foxit.com`, where the SAME
 *     client_id / client_secret that authenticate PDF Services are sent directly
 *     as headers. No token to mint, no second signup.
 *
 * This targets the unified platform — verified against the live API: the starter
 * request from the eSign API dashboard returns a DRAFT folder with header auth.
 *
 *   FOXIT_CLIENT_ID       from https://app.developer-api.foxit.com
 *   FOXIT_CLIENT_SECRET   from the same place
 *   FOXIT_ESIGN_HOST      regional host, default https://na1.fusion.foxit.com
 *
 * What does NOT change is the boundary this integration exists to demonstrate.
 * Foxit deliberately leaves signing out of their MCP server's tool catalogue: an
 * agent gets ~40 reversible PDF operations, and putting a document in front of a
 * signer means leaving the tool sandbox. See `lib/state/agent-tools.ts`.
 */
const HOST = (process.env.FOXIT_ESIGN_HOST || "https://na1.fusion.foxit.com").replace(/\/$/, "");
export const FOXIT_ESIGN_ENDPOINT = `${HOST}/esign/api/v1/folders/createfolder`;

export function isFoxitConfigured(): boolean {
  const set = (v?: string) => Boolean(v && v.trim());
  return set(process.env.FOXIT_CLIENT_ID) && set(process.env.FOXIT_CLIENT_SECRET);
}

export async function createFoxitSigningSession(opts: {
  documentTitle: string;
  signerName: string;
  signerEmail?: string;
  documentUrl?: string;
  /** The agreement's own bytes, when we can supply them. Preferred over a URL. */
  documentBytes?: Buffer | null;
}): Promise<{ sessionId: string; status: string }> {
  if (getDemoFlags().foxit) throw new Error("Foxit failure injected for demo");

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

  // createfolder needs the document itself. Prefer sending the bytes: the agreement
  // lives behind Doctavian's authenticated storage, so passing that URL makes Foxit
  // fetch it anonymously and fail with "error in downloading file from url". Only
  // fall back to a URL when we have no bytes to give.
  payload.fileNames = ["emergency-supplier-transition-agreement.pdf"];
  if (opts.documentBytes?.length) {
    payload.inputType = "base64";
    payload.base64FileString = [opts.documentBytes.toString("base64")];
  } else {
    const url =
      opts.documentUrl && /^https?:\/\//.test(opts.documentUrl) && !/doctavian/i.test(opts.documentUrl)
        ? opts.documentUrl
        : "https://app.developer-api.foxit.com/esign/foxit-esign-api-sample.pdf";
    payload.inputType = "url";
    payload.fileUrls = [url];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
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
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Foxit eSign HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
    }
    const json = await res.json();
    // A rejected request still answers 200 with {result:"error", error_description}.
    if (json?.result === "error") {
      throw new Error(`Foxit eSign rejected the request: ${json.error_description ?? "unknown"}`);
    }
    const folder = json.folder ?? json.data ?? json;
    const sessionId = folder.folderId ?? folder.id ?? folder.folderID;
    if (sessionId == null) throw new Error("Unrecognized Foxit eSign response shape");
    return { sessionId: String(sessionId), status: folder.folderStatus ?? folder.status ?? "DRAFT" };
  } finally {
    clearTimeout(timeout);
  }
}
