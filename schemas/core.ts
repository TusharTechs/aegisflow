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
  conflictReason: z.string().optional()
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
  auditLog: z.array(z.object({
    timestamp: z.string(),
    event: z.string(),
    actor: z.enum(["SYSTEM", "AI", "HUMAN"])
  }))
});

export type WorkflowStateType = z.infer<typeof WorkflowState>;
export type EvidenceStatusType = z.infer<typeof EvidenceStatus>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Supplier = z.infer<typeof SupplierSchema>;
export type Incident = z.infer<typeof IncidentSchema>;