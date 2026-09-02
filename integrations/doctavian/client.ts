import { getDemoFlags } from "@/lib/orchestration/demo-controls";
import type { ContractPayload } from "@/schemas/core";

/**
 * Doctavian Document Generation API.
 *
 * Doctavian does not take "a template id and some variables". Its model is a
 * *document request*: data is uploaded as a file and addressed by URN, a template
 * is uploaded and addressed by URN, and generation ties the two together with an
 * output spec (format, locale, timezone, delivery target). That is a better fit
 * for this app than a string-interpolation API, because the thing we hand over is
 * already a typed, Zod-validated decision payload — not a prompt.
 *
 * Two credentials are required, and both are enforced by the gateway:
 *   X-Api-Key       the subscription key issued with the account
 *   Authorization   a Microsoft OAuth2 bearer (authorization_code + PKCE)
 *
 * The OAuth flow is interactive by design, so the bearer is supplied via env
 * rather than minted here. The Postman collection Doctavian ships has the login
 * built in — run "Get New Access Token" once and paste the result.
 *
 *   DOCTAVIAN_API_BASE       https://demo.api.doctavian.com
 *   DOCTAVIAN_API_KEY        subscription key
 *   DOCTAVIAN_ACCESS_TOKEN   Microsoft OAuth bearer
 *   DOCTAVIAN_TEMPLATE_URN   URN of the uploaded agreement template
 */
const BASE = (process.env.DOCTAVIAN_API_BASE || "https://demo.api.doctavian.com").replace(/\/$/, "");

export const DOCTAVIAN_GENERATE_ENDPOINT = `${BASE}/v1/documents/document/generate`;
export const DOCTAVIAN_DATA_UPLOAD_ENDPOINT = `${BASE}/v1/documents/data/upload`;
export const DOCTAVIAN_DOWNLOAD_ENDPOINT = `${BASE}/v1/documents/document`;

/** A whitespace-only value is a placeholder, not a credential. */
const isSet = (v?: string) => Boolean(v && v.trim());

export function isDoctavianConfigured(): boolean {
  return (
    isSet(process.env.DOCTAVIAN_API_KEY) &&
    isSet(process.env.DOCTAVIAN_ACCESS_TOKEN) &&
    isSet(process.env.DOCTAVIAN_TEMPLATE_URN)
  );
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "X-Api-Key": process.env.DOCTAVIAN_API_KEY!,
    Authorization: `Bearer ${process.env.DOCTAVIAN_ACCESS_TOKEN!}`,
    ...extra,
  };
}

async function ensureOk(res: Response, what: string): Promise<unknown> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const hint =
      res.status === 401
        ? " — DOCTAVIAN_ACCESS_TOKEN is missing or expired; mint a fresh one from the Doctavian Postman collection."
        : "";
    throw new Error(`Doctavian ${what} HTTP ${res.status}${hint}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

/** Pull an id/urn out of Doctavian's envelope shapes, which vary per endpoint. */
function pickUrn(json: unknown): string | undefined {
  const at = (path: string[]): unknown =>
    path.reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), json);

  const candidates = [
    ["result", "data", "document", "urn"],
    ["result", "data", "urn"],
    ["result", "data", "id"],
    ["data", "document", "urn"],
    ["data", "urn"],
    ["data", "id"],
    ["urn"],
    ["id"],
  ];
  for (const path of candidates) {
    const value = at(path);
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Upload the decision payload as Doctavian's data file for this generation.
 * The agreement is filled from these exact fields — the same object the UI shows
 * and the same object the contract schema validates.
 */
export async function uploadContractData(payload: ContractPayload): Promise<string> {
  const form = new FormData();
  const json = JSON.stringify(payload, null, 2);
  form.append("file", new Blob([json], { type: "application/json" }), `${payload.agreementId}.json`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(DOCTAVIAN_DATA_UPLOAD_ENDPOINT, {
      method: "POST",
      headers: headers(),
      body: form,
      signal: controller.signal,
    });
    const json = await ensureOk(res, "data upload");
    const urn = pickUrn(json);
    if (!urn) throw new Error("Unrecognized Doctavian data-upload response — no urn");
    return urn;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildGenerateRequest(payload: ContractPayload, dataUrn: string) {
  return {
    externalContext: { id: payload.agreementId },
    template: {
      name: "emergency-supplier-transition-agreement.docx",
      urn: process.env.DOCTAVIAN_TEMPLATE_URN!,
      fileFormat: process.env.DOCTAVIAN_TEMPLATE_FORMAT || "docx",
      loadMethod: "Storage",
      options: {},
    },
    data: {
      loadMethod: "Storage",
      urn: dataUrn,
    },
    document: {
      name: `emergency-supplier-transition-agreement-${payload.agreementId}`,
      fileFormat: "pdf",
      deliveryMethod: "Storage",
      path: "root",
      locale: "en",
      timezone: "UTC",
      options: {},
    },
  };
}

export async function generateViaDoctavian(
  payload: ContractPayload
): Promise<{ url: string; urn: string; dataUrn: string; request: unknown }> {
  if (getDemoFlags().doctavian) throw new Error("Doctavian failure injected for demo");

  const dataUrn = await uploadContractData(payload);
  const body = buildGenerateRequest(payload, dataUrn);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(DOCTAVIAN_GENERATE_ENDPOINT, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await ensureOk(res, "generate");
    const urn = pickUrn(json);
    if (!urn) throw new Error("Unrecognized Doctavian generate response — no document urn");
    return {
      url: `${DOCTAVIAN_DOWNLOAD_ENDPOINT}/${encodeURIComponent(urn)}/download`,
      urn,
      dataUrn,
      request: body,
    };
  } finally {
    clearTimeout(timeout);
  }
}
