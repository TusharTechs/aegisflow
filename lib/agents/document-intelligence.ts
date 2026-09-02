import fs from "fs/promises";
import path from "path";
import { DOC_REGISTRY } from "@/data/demo/documents";
import { Incident } from "@/schemas/core";
import { ProcessedDocument } from "@/schemas/core";
import { extractTextViaNutrient, isNutrientConfigured, NUTRIENT_EXTRACT_ENDPOINT } from "@/integrations/nutrient/client";
import { extractTextLocal } from "@/integrations/nutrient/local-extract";
import type { ActivityLedger } from "@/lib/integrations/ledger";
import { getDemoFlags } from "@/lib/orchestration/demo-controls";
import { ClaimSubject, classifyClaim, deriveClaims } from "@/lib/agents/document-rules";

export interface ExtractedClaim {
  supplierId: string;
  /** What the claim is about — how it is matched to a supplier's stated claim. */
  subject: ClaimSubject;
  text: string;
  confidence: number;
  status: "VERIFIED" | "UNVERIFIED" | "CONFLICT";
  conflictReason?: string;
  field: string;
  /** The verification rule that produced this verdict. */
  rule: string;
  documentId: string;
  mode: "LIVE" | "LOCAL";
}

export interface DocIntelReport {
  documents: ProcessedDocument[];
  totalFields: number;
  claims: ExtractedClaim[];
  liveCount: number;
}

/**
 * Pull `KEY: value` pairs out of extracted text.
 *
 * Tolerant on purpose: Nutrient DWS returns CRLF line endings, pads values with
 * runs of spaces, and drops underscores from key names inconsistently depending on
 * glyph spacing. Keys are kept as extracted — `readField` in document-rules.ts
 * matches them canonically, so a rule never depends on which extractor ran.
 */
function parseFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z_0-9]*)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/\s{2,}/g, " ").trim();
    if (value && !(m[1] in fields)) fields[m[1]] = value;
  }
  return fields;
}

// An extraction costs ~3 DWS credits. By default only the documents that carry the
// contradiction go through DWS, so the app stays usable on a small credit grant;
// NUTRIENT_FULL=true routes all six. The default is deliberately the conservative
// one — someone cloning this repo gets a free tier, not an event grant.
const NUTRIENT_PRIORITY_DOCS = new Set([
  "shenzhen-iso-9001-certificate",
  "shenzhen-business-registration",
  "nexus-business-registration",
]);

export interface DocIntelContext {
  /** The component the incident is about — the equivalence rule is judged against it. */
  affectedProduct?: string;
}

export async function runDocumentIntelligence(
  ledger?: ActivityLedger,
  ctx: DocIntelContext = {}
): Promise<DocIntelReport> {
  const documents: ProcessedDocument[] = [];
  const claims: ExtractedClaim[] = [];
  let liveCount = 0;
  const nutrientFailInjected = getDemoFlags().nutrient;
  const nutrientOn = isNutrientConfigured() && !nutrientFailInjected;
  const nutrientFull = process.env.NUTRIENT_FULL === "true";

  // Extract all six PDFs concurrently, then merge in registry order.
  const perDoc = await Promise.all(
    DOC_REGISTRY.map(async (doc) => {
      const pdfPath = path.join(process.cwd(), "public", "docs", `${doc.id}.pdf`);
      let text = "";
      let mode: "LIVE" | "LOCAL" = "LOCAL";
      const start = Date.now();
      let liveError: string | null = null;
      const nutrientEnabled = nutrientOn && (nutrientFull || NUTRIENT_PRIORITY_DOCS.has(doc.id));

      if (nutrientEnabled) {
        try {
          const bytes = await fs.readFile(pdfPath);
          text = await extractTextViaNutrient(bytes, `${doc.id}.pdf`);
          mode = "LIVE";
        } catch (err) {
          liveError = err instanceof Error ? err.message : "unknown error";
          try {
            text = await extractTextLocal(pdfPath);
          } catch {
            text = "";
          }
          mode = "LOCAL";
        }
      } else {
        try {
          text = await extractTextLocal(pdfPath);
        } catch {
          text = "";
        }
        mode = "LOCAL";
      }
      return { doc, text, mode, start, liveError };
    })
  );

  for (const { doc, text, mode, start, liveError } of perDoc) {
    if (mode === "LIVE") liveCount++;
    const fields = parseFields(text);
    const routedLocal = nutrientOn && !nutrientFull && !NUTRIENT_PRIORITY_DOCS.has(doc.id);

    ledger?.record({
      sponsor: "Nutrient",
      operation: `/build json-content · ${doc.type}`,
      method: "POST",
      endpoint: NUTRIENT_EXTRACT_ENDPOINT,
      request: {
        file: `${doc.id}.pdf`,
        supplier: doc.supplierId ?? "n/a",
        instructions: { parts: [{ file: "document" }], output: { type: "json-content", plainText: true, tables: true } },
      },
      response: { mode, field_count: Object.keys(fields).length, fields },
      mode: mode === "LIVE" ? "LIVE" : "LOCAL",
      status: mode === "LIVE" ? "ok" : liveError ? "error" : "fallback",
      ms: Date.now() - start,
      note:
        mode === "LIVE"
          ? `${Object.keys(fields).length} fields extracted via Nutrient DWS.`
          : liveError
            ? `Nutrient call failed (${liveError}); local PDF text extraction used for this document.`
            : nutrientFailInjected
              ? "Nutrient failure injected via demo control — local PDF text extraction used."
              : routedLocal
                ? "Routed to local extraction to conserve Nutrient DWS credits — the conflict-bearing documents go through DWS. Set NUTRIENT_FULL=true to run all six."
                : "NUTRIENT_API_KEY not configured — local PDF text extraction used. Set the key to run this via Nutrient DWS.",
    });
    documents.push({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      supplierId: doc.supplierId ?? undefined,
      fieldCount: Object.keys(fields).length,
      mode,
      url: `/docs/${doc.id}.pdf`,
    });
    if (doc.supplierId) {
      const derived = deriveClaims(doc.type, fields, {
        supplierId: doc.supplierId,
        affectedProduct: ctx.affectedProduct,
      });
      claims.push(...derived.map((d) => ({ ...d, documentId: doc.id, mode })));
    }
  }

  return {
    documents,
    totalFields: documents.reduce((a, d) => a + d.fieldCount, 0),
    claims,
    liveCount,
  };
}

/**
 * Fold document-derived verdicts into the incident.
 *
 * An extracted claim adjudicates a supplier's *stated* claim when both are about
 * the same subject — matched by `classifyClaim`, so neither side has to hardcode
 * the other's id. Anything with no counterpart is appended as new evidence.
 */
export function mergeDocClaims(incident: Incident, report: DocIntelReport) {
  for (const ec of report.claims) {
    const supplier = incident.alternativeSuppliers.find((s) => s.id === ec.supplierId);
    if (!supplier) continue;
    const evidence = { documentId: ec.documentId, field: ec.field, mode: ec.mode, rule: ec.rule };

    const existing = supplier.claims.find((c) => classifyClaim(c.text) === ec.subject);
    if (existing) {
      existing.confidence = ec.confidence;
      existing.status = ec.status;
      existing.conflictReason = ec.conflictReason;
      existing.documentEvidence = evidence;
      continue;
    }

    supplier.claims.push({
      id: `${supplier.id}-doc-${supplier.claims.length + 1}`,
      text: ec.text,
      source: "Document extraction",
      timestamp: new Date().toISOString().slice(0, 10),
      confidence: ec.confidence,
      status: ec.status,
      conflictReason: ec.conflictReason,
      documentEvidence: evidence,
    });
  }
  incident.documentsProcessed = report.documents;
}