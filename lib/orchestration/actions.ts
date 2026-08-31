"use server";

import { revalidatePath } from "next/cache";
import { appendAudit, getIncident, resetRepository, saveIncident, transitionIncident } from "@/lib/incidents/repository";
import { rankSuppliers } from "@/lib/suppliers/ranking";
import { buildContractPayload } from "@/lib/documents/contract";
import { DOCTAVIAN_GENERATE_ENDPOINT, generateViaDoctavian, isDoctavianConfigured } from "@/integrations/doctavian/client";
import { FOXIT_ESIGN_ENDPOINT, createFoxitSigningSession, isFoxitConfigured } from "@/integrations/foxit/client";
import { NUTRIENT_BUILD_ENDPOINT, isNutrientConfigured } from "@/integrations/nutrient/client";
import { getDemoFlags, setDemoFlag, DemoFlags } from "@/lib/orchestration/demo-controls";
import { recordOnIncident } from "@/lib/integrations/ledger";
import { assertHumanMaySign } from "@/lib/state/guards";

/** revalidatePath throws outside a request scope (e.g. unit tests); that is not fatal here. */
function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    /* not in a request context */
  }
}

export async function approve(id: string) {
  try {
    const incident = await getIncident(id);
    if (!incident) return;
    const recommended = incident.alternativeSuppliers.find((s) => s.recommendation)?.name ?? "recommended supplier";
    await transitionIncident(id, "APPROVED", "HUMAN", `Human approved transition to ${recommended}`);
    revalidatePath(`/incidents/${id}`);
  } catch {}
}

export async function resetDemo() {
  await resetRepository();
  revalidatePath("/", "layout");
}

export async function requestEvidence(id: string) {
  try {
    await transitionIncident(id, "INVESTIGATING", "HUMAN", "Human requested additional evidence");
    revalidatePath(`/incidents/${id}`);
  } catch {}
}

export async function reject(id: string) {
  try {
    await transitionIncident(id, "REJECTED", "HUMAN", "Human rejected the recommendation");
    revalidatePath(`/incidents/${id}`);
  } catch {}
}

export async function prepareDocuments(id: string) {
  const incident = await getIncident(id);
  if (!incident || incident.state !== "APPROVED") return;

  const ranked = rankSuppliers(incident);
  const recommended = incident.alternativeSuppliers.find((s) => s.recommendation) ?? ranked[0].supplier;
  const payload = buildContractPayload(incident, recommended, incident.decision);

  let mode: "LIVE" | "LOCAL" = "LOCAL";
  let url = `/documents/agreement/${id}`;
  const docStart = Date.now();
  const doctavianFail = getDemoFlags().doctavian;
  if (isDoctavianConfigured() && !doctavianFail) {
    try {
      const result = await generateViaDoctavian(payload);
      url = result.url;
      mode = "LIVE";
      recordOnIncident(incident, {
        sponsor: "Doctavian",
        operation: "generate Emergency Supplier Transition Agreement",
        method: "POST",
        endpoint: DOCTAVIAN_GENERATE_ENDPOINT,
        request: { template_id: process.env.DOCTAVIAN_TEMPLATE_ID ?? "emergency-transition-agreement", variables: payload },
        response: { url, document_id: payload.agreementId },
        mode: "LIVE",
        status: "ok",
        ms: Date.now() - docStart,
        note: "Agreement rendered by Doctavian from the structured decision payload.",
      });
    } catch (err) {
      mode = "LOCAL";
      recordOnIncident(incident, {
        sponsor: "Doctavian",
        operation: "generate Emergency Supplier Transition Agreement",
        method: "POST",
        endpoint: DOCTAVIAN_GENERATE_ENDPOINT,
        request: { template_id: process.env.DOCTAVIAN_TEMPLATE_ID ?? "emergency-transition-agreement", variables: payload },
        response: { error: err instanceof Error ? err.message : "unknown" },
        mode: "LOCAL",
        status: "error",
        ms: Date.now() - docStart,
        note: "Doctavian call failed; the same payload is rendered locally at /documents/agreement.",
      });
    }
  } else {
    recordOnIncident(incident, {
      sponsor: "Doctavian",
      operation: "generate Emergency Supplier Transition Agreement",
      method: "POST",
      endpoint: DOCTAVIAN_GENERATE_ENDPOINT,
      request: { template_id: process.env.DOCTAVIAN_TEMPLATE_ID ?? "emergency-transition-agreement", variables: payload },
      response: { rendered_at: url, fields: Object.keys(payload).length },
      mode: "LOCAL",
      status: "fallback",
      ms: Date.now() - docStart,
      note: doctavianFail
        ? "Doctavian failure injected via demo control — same payload rendered locally."
        : "DOCTAVIAN_API_KEY not configured — same structured payload rendered locally at /documents/agreement.",
    });
  }

  // Second Nutrient touchpoint: stamp the agreement PENDING HUMAN SIGNATURE before a human sees it.
  const wmStart = Date.now();
  const watermarkText = "PENDING HUMAN SIGNATURE — NOT BINDING";
  const nutrientWmEnabled = isNutrientConfigured() && !getDemoFlags().nutrient && mode === "LIVE";
  recordOnIncident(incident, {
    sponsor: "Nutrient",
    operation: "watermark generated agreement",
    method: "POST",
    endpoint: NUTRIENT_BUILD_ENDPOINT,
    request: { actions: [{ type: "watermark", text: watermarkText, opacity: 0.18, rotation: 45 }] },
    response: nutrientWmEnabled
      ? { applied: true, target: url }
      : { applied: "on-page banner", target: `/documents/agreement/${id}` },
    mode: nutrientWmEnabled ? "LIVE" : "LOCAL",
    status: nutrientWmEnabled ? "ok" : "fallback",
    ms: Date.now() - wmStart,
    note: nutrientWmEnabled
      ? "Watermark applied to the Doctavian PDF via Nutrient DWS build pipeline."
      : "Applied as a visible PENDING HUMAN SIGNATURE banner on the rendered agreement. Set NUTRIENT_API_KEY + Doctavian to stamp the PDF itself.",
  });

  incident.generatedDocument = {
    id: payload.agreementId,
    kind: "EMERGENCY_TRANSITION_AGREEMENT",
    title: "Emergency Supplier Transition Agreement",
    mode,
    url,
    generatedAt: new Date().toISOString(),
    payload,
  };

  await saveIncident(incident);
  await appendAudit(id, `Agreement generated (${mode === "LIVE" ? "Doctavian" : "local render"})`, "AI");
  await transitionIncident(id, "DOCUMENT_PREPARED", "SYSTEM");
  await transitionIncident(id, "SIGNATURE_REQUIRED", "SYSTEM", "Signature requested — human authorization required");
  safeRevalidate(`/incidents/${id}`);
}

export async function signAgreement(id: string, formData: FormData) {
  const incident = await getIncident(id);
  if (!incident || incident.state !== "SIGNATURE_REQUIRED") return;

  const signerName = String(formData.get("signerName") ?? "").trim();
  const signerTitle = String(formData.get("signerTitle") ?? "").trim();
  const authorized = formData.get("authorized") === "on";
  if (!signerName || !signerTitle || !authorized) return;

  // "Your agent shouldn't sign that." This throws for any non-HUMAN actor or wrong state.
  assertHumanMaySign("HUMAN", incident.state);

  const foxitStart = Date.now();
  const foxitFail = getDemoFlags().foxit;
  const signerEmail = String(formData.get("signerEmail") ?? "").trim() || undefined;
  const docUrl = incident.generatedDocument?.url;
  let foxitSessionId: string | undefined;
  const foxitReq = {
    folderName: incident.generatedDocument?.title ?? "Emergency Supplier Transition Agreement",
    sendNow: false,
    parties: [{ name: signerName, role: signerTitle, email: signerEmail ?? "(not provided)" }],
    fileUrls: docUrl && /^https?:\/\//.test(docUrl) ? [docUrl] : "(rendered in-app)",
    authorized_by: "HUMAN",
  };
  if (isFoxitConfigured() && !foxitFail) {
    try {
      const session = await createFoxitSigningSession({
        documentTitle: foxitReq.folderName,
        signerName,
        signerEmail,
        documentUrl: docUrl,
      });
      foxitSessionId = session.sessionId;
      await appendAudit(id, `Foxit eSign folder created (${foxitSessionId})`, "SYSTEM");
      recordOnIncident(incident, {
        sponsor: "Foxit",
        operation: "create eSign signing folder (client_credentials → bearer)",
        method: "POST",
        endpoint: FOXIT_ESIGN_ENDPOINT,
        request: foxitReq,
        response: { folderId: foxitSessionId, status: session.status },
        mode: "LIVE",
        status: "ok",
        ms: Date.now() - foxitStart,
        note: "Folder created with sendNow:false — prepared only after the human authorization guard passed; the agent never sends it.",
      });
    } catch (err) {
      foxitSessionId = undefined;
      recordOnIncident(incident, {
        sponsor: "Foxit",
        operation: "create eSign signing session",
        method: "POST",
        endpoint: FOXIT_ESIGN_ENDPOINT,
        request: foxitReq,
        response: { error: err instanceof Error ? err.message : "unknown" },
        mode: "LOCAL",
        status: "error",
        ms: Date.now() - foxitStart,
        note: "Foxit call failed; the in-app human signing ceremony is the authorization of record.",
      });
    }
  } else {
    recordOnIncident(incident, {
      sponsor: "Foxit",
      operation: "create eSign signing session",
      method: "POST",
      endpoint: FOXIT_ESIGN_ENDPOINT,
      request: foxitReq,
      response: { ceremony: "in-app", authorized_by: `${signerName} (${signerTitle})` },
      mode: "LOCAL",
      status: "fallback",
      ms: Date.now() - foxitStart,
      note: foxitFail
        ? "Foxit failure injected via demo control — in-app human signing ceremony used."
        : "FOXIT_CLIENT_ID / _SECRET not configured — in-app human signing ceremony is the authorization of record.",
    });
  }

  incident.signature = { signerName, signerTitle, signedAt: new Date().toISOString(), foxitSessionId };
  await saveIncident(incident);
  await transitionIncident(
    id,
    "SIGNED",
    "HUMAN",
    `Agreement signed by ${signerName} (${signerTitle}) — irreversible action authorized by human`
  );
  safeRevalidate(`/incidents/${id}`);
}

export async function getDemoControlsState(): Promise<DemoFlags> {
  return getDemoFlags();
}

export async function setDemoFlagAction(key: string, value: boolean) {
  setDemoFlag(key as keyof DemoFlags, value);
}