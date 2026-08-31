"use server";

import { revalidatePath } from "next/cache";
import { appendAudit, getIncident, resetRepository, transitionIncident } from "@/lib/incidents/repository";
import { rankSuppliers } from "@/lib/suppliers/ranking";
import { buildContractPayload } from "@/lib/documents/contract";
import { generateViaDoctavian, isDoctavianConfigured } from "@/integrations/doctavian/client";
import { createFoxitSigningSession, isFoxitConfigured } from "@/integrations/foxit/client";

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
  if (isDoctavianConfigured()) {
    try {
      const result = await generateViaDoctavian(payload);
      url = result.url;
      mode = "LIVE";
    } catch {
      mode = "LOCAL";
    }
  }

  incident.generatedDocument = {
    id: payload.agreementId,
    kind: "EMERGENCY_TRANSITION_AGREEMENT",
    title: "Emergency Supplier Transition Agreement",
    mode,
    url,
    generatedAt: new Date().toISOString(),
    payload,
  };

  await appendAudit(id, `Agreement generated (${mode === "LIVE" ? "Doctavian" : "local render"})`, "AI");
  await transitionIncident(id, "DOCUMENT_PREPARED", "SYSTEM");
  await transitionIncident(id, "SIGNATURE_REQUIRED", "SYSTEM", "Signature requested — human authorization required");
  revalidatePath(`/incidents/${id}`);
}

export async function signAgreement(id: string, formData: FormData) {
  const incident = await getIncident(id);
  if (!incident || incident.state !== "SIGNATURE_REQUIRED") return;

  const signerName = String(formData.get("signerName") ?? "").trim();
  const signerTitle = String(formData.get("signerTitle") ?? "").trim();
  const authorized = formData.get("authorized") === "on";
  if (!signerName || !signerTitle || !authorized) return;

  let foxitSessionId: string | undefined;
  if (isFoxitConfigured()) {
    try {
      const session = await createFoxitSigningSession({
        documentTitle: incident.generatedDocument?.title ?? "Emergency Supplier Transition Agreement",
        signerName,
      });
      foxitSessionId = session.sessionId;
      await appendAudit(id, `Foxit eSign session created (${foxitSessionId})`, "SYSTEM");
    } catch {
      foxitSessionId = undefined;
    }
  }

  incident.signature = { signerName, signerTitle, signedAt: new Date().toISOString(), foxitSessionId };
  await transitionIncident(
    id,
    "SIGNED",
    "HUMAN",
    `Agreement signed by ${signerName} (${signerTitle}) — irreversible action authorized by human`
  );
  revalidatePath(`/incidents/${id}`);
}