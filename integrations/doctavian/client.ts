import { getDemoFlags } from "@/lib/orchestration/demo-controls";
import type { ContractPayload } from "@/schemas/core";
import { AGREEMENT_TEMPLATE_FILENAME, buildAgreementTemplateDocx } from "@/lib/documents/doctavian-template";

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
 *
 * There is no template URN to configure: the demo environment consumes an
 * uploaded template on first use, so one is built and uploaded per generation.
 */
const BASE = (process.env.DOCTAVIAN_API_BASE || "https://demo.api.doctavian.com").replace(/\/$/, "");

export const DOCTAVIAN_GENERATE_ENDPOINT = `${BASE}/v1/documents/document/generate`;
export const DOCTAVIAN_DATA_UPLOAD_ENDPOINT = `${BASE}/v1/documents/data/upload`;
export const DOCTAVIAN_TEMPLATE_UPLOAD_ENDPOINT = `${BASE}/v1/documents/template/upload`;
export const DOCTAVIAN_DOWNLOAD_ENDPOINT = `${BASE}/v1/documents/document`;

/** A whitespace-only value is a placeholder, not a credential. */
const isSet = (v?: string) => Boolean(v && v.trim());

export function isDoctavianConfigured(): boolean {
  // No template URN needed: the demo environment consumes an uploaded template on
  // first use, so one is built and uploaded per generation.
  return isSet(process.env.DOCTAVIAN_API_KEY) && isSet(process.env.DOCTAVIAN_ACCESS_TOKEN);
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
  const at = (path: Array<string | number>): unknown =>
    path.reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string | number, unknown>)[key]
          : undefined,
      json
    );

  const candidates: Array<Array<string | number>> = [
    // Uploads answer { result: { data: { files: [ { id, fileName } ] } } }.
    ["result", "data", "files", 0, "id"],
    ["data", "files", 0, "id"],
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
export function toDoctavianData(payload: ContractPayload) {
  // Doctavian resolves `{!Agreement.field}` against a named collection, so the
  // payload is wrapped the way its own sample data file is shaped:
  // { data: { <Collection>: [ { ...fields } ] } }. See docs/doctavian/.
  return { data: { Agreement: [payload] } };
}

async function uploadFile(endpoint: string, blob: Blob, filename: string, what: string): Promise<string> {
  const form = new FormData();
  form.append("file", blob, filename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: headers(),
      body: form,
      signal: controller.signal,
    });
    const json = await ensureOk(res, what);
    const urn = pickUrn(json);
    if (!urn) throw new Error(`Unrecognized Doctavian ${what} response — no urn`);
    return urn;
  } finally {
    clearTimeout(timeout);
  }
}

export async function uploadContractData(payload: ContractPayload): Promise<string> {
  const json = JSON.stringify(toDoctavianData(payload), null, 2);
  return uploadFile(
    DOCTAVIAN_DATA_UPLOAD_ENDPOINT,
    new Blob([json], { type: "application/json" }),
    `${payload.agreementId}.json`,
    "data upload"
  );
}

/**
 * Upload the agreement template for this generation.
 *
 * Deliberately per-run: the demo environment consumes a template on first use, so
 * a URN captured once works exactly once and then fails with
 * FILE_MISSING_FROM_STORAGE. Building it in memory keeps the placeholders and the
 * ContractPayload in the same repo, so they cannot drift.
 */
export async function uploadAgreementTemplate(): Promise<string> {
  const bytes = buildAgreementTemplateDocx();
  return uploadFile(
    DOCTAVIAN_TEMPLATE_UPLOAD_ENDPOINT,
    new Blob([new Uint8Array(bytes)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    AGREEMENT_TEMPLATE_FILENAME,
    "template upload"
  );
}

export function buildGenerateRequest(payload: ContractPayload, dataUrn: string, templateUrn: string) {
  return {
    externalContext: { id: payload.agreementId },
    template: {
      name: AGREEMENT_TEMPLATE_FILENAME,
      urn: templateUrn,
      fileFormat: "docx",
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

  // Template and data are both uploaded for this run, then tied together.
  const [templateUrn, dataUrn] = await Promise.all([uploadAgreementTemplate(), uploadContractData(payload)]);
  const body = buildGenerateRequest(payload, dataUrn, templateUrn);

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
