// schemas/core.ts
import { z } from "zod";

export const WorkflowState = z.enum([
  "INVESTIGATING",
  "RECOMMENDATION_READY",
  "HUMAN_REVIEW",
  "APPROVED",
  "DOCUMENT_PREPARED",
  "SIGNATURE_REQUIRED",
  "SIGNED",
  "REJECTED"
]);

export const EvidenceStatus = z.enum([
  "VERIFIED",
  "UNVERIFIED",
  "CONFLICT",
  "STALE",
  "MISSING"
]);

export const ClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  source: z.string(),
  timestamp: z.string(),
  confidence: z.number().min(0).max(100),
  status: EvidenceStatus,
  conflictReason: z.string().optional(),
  documentEvidence: z.object({
    documentId: z.string(),
    field: z.string(),
    mode: z.enum(["LIVE", "LOCAL"]),
  }).optional(),
});

export const SupplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  claims: z.array(ClaimSchema),
  riskScore: z.number().min(0).max(100),
  leadTimeDays: z.number(),
  costMultiplier: z.number(), // 1.0 = baseline
  recommendation: z.boolean().optional(),
  recommendationReasoning: z.string().optional()
});

export const ProcessedDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  supplierId: z.string().optional(),
  fieldCount: z.number(),
  mode: z.enum(["LIVE", "LOCAL"]),
  url: z.string(),
});
export type ProcessedDocument = z.infer<typeof ProcessedDocumentSchema>;

export const ContractPayloadSchema = z.object({
  agreementId: z.string(),
  buyer: z.string(),
  supplier: z.string(),
  product: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalValue: z.number(),
  deliveryDeadlineDays: z.number(),
  sla: z.string(),
  compliance: z.array(z.string()),
  effectiveDate: z.string(),
  riskConditions: z.array(z.string()),
  contingency: z.string(),
  evidenceSummary: z.object({
    verified: z.number(),
    conflicts: z.number(),
    confidence: z.number(),
  }),
});
export type ContractPayload = z.infer<typeof ContractPayloadSchema>;

export const GeneratedDocumentSchema = z.object({
  id: z.string(),
  kind: z.enum(["EMERGENCY_TRANSITION_AGREEMENT"]),
  title: z.string(),
  mode: z.enum(["LIVE", "LOCAL"]),
  url: z.string(),
  generatedAt: z.string(),
  payload: ContractPayloadSchema,
});
export type GeneratedDocument = z.infer<typeof GeneratedDocumentSchema>;

export const SignatureRecordSchema = z.object({
  signerName: z.string(),
  signerTitle: z.string(),
  signedAt: z.string(),
  foxitSessionId: z.string().optional(),
});
export type SignatureRecord = z.infer<typeof SignatureRecordSchema>;

export const ApiCallSchema = z.object({
  id: z.string(),
  sponsor: z.enum(["SerpApi", "Nutrient", "Doctavian", "Foxit", "Xano", "Gemini"]),
  operation: z.string(),
  method: z.string(),
  endpoint: z.string(),
  request: z.unknown().optional(),
  response: z.unknown().optional(),
  mode: z.enum(["LIVE", "LOCAL", "DEMO SEEDED"]),
  status: z.enum(["ok", "fallback", "error"]),
  ms: z.number(),
  at: z.string(),
  note: z.string().optional(),
});
export type ApiCall = z.infer<typeof ApiCallSchema>;

export const ExternalSourceSchema = z.object({
  id: z.string(),
  query: z.string(),
  supplierId: z.string().optional(),
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  engine: z.string(),
  observedAt: z.string(),
  mode: z.enum(["LIVE", "DEMO SEEDED"]),
  relevance: z.number().min(0).max(100),
});
export type ExternalSource = z.infer<typeof ExternalSourceSchema>;

export const IncidentSchema = z.object({
  id: z.string(),
  supplier: z.string(),
  affectedProduct: z.string(),
  status: z.enum(["CRITICAL", "WARNING", "RESOLVED"]),
  inventoryDays: z.number(),
  revenueExposure: z.number(),
  state: WorkflowState,
  alternativeSuppliers: z.array(SupplierSchema),
  decision: z.object({
    recommendedSupplierId: z.string(),
    confidence: z.number().min(0).max(100),
    reasoning: z.string(),
    risks: z.array(z.string()),
    unknowns: z.array(z.string()),
    source: z.enum(["gemini", "fallback"]),
  }).optional(),
  externalSources: z.array(ExternalSourceSchema).optional(),
  apiActivity: z.array(ApiCallSchema).optional(),
  auditLog: z.array(z.object({
    timestamp: z.string(),
    event: z.string(),
    actor: z.enum(["SYSTEM", "AI", "HUMAN"])
  })),
  documentsProcessed: z.array(ProcessedDocumentSchema).optional(),
  generatedDocument: GeneratedDocumentSchema.optional(),
  signature: SignatureRecordSchema.optional(),
});

export type WorkflowStateType = z.infer<typeof WorkflowState>;
export type EvidenceStatusType = z.infer<typeof EvidenceStatus>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Supplier = z.infer<typeof SupplierSchema>;
export type Incident = z.infer<typeof IncidentSchema>;