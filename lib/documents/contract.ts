import { ContractPayload, Incident, Supplier } from "@/schemas/core";
import { Decision } from "@/lib/agents/decision";
import { verifyClaims } from "@/lib/agents/verification";

// Stated business assumptions (demo): 8-week cover for the PX-17 line,
// baseline price from the Pacific Components master agreement.
const EMERGENCY_UNITS = 1500;
const BASE_UNIT_PRICE = 86;

export function buildContractPayload(incident: Incident, supplier: Supplier, decision?: Decision): ContractPayload {
  const unitPrice = Math.round(BASE_UNIT_PRICE * supplier.costMultiplier * 100) / 100;
  const report = verifyClaims(incident);
  return {
    agreementId: `AGR-${incident.id}`,
    buyer: "Meridian Manufacturing Co.",
    supplier: supplier.name,
    product: incident.affectedProduct,
    quantity: EMERGENCY_UNITS,
    unitPrice,
    totalValue: Math.round(unitPrice * EMERGENCY_UNITS),
    deliveryDeadlineDays: supplier.leadTimeDays + 2,
    sla: "98% on-time delivery; 24-hour disruption notice; 0.5% of order value per day late",
    compliance: ["ISO 9001:2015", "RoHS", "CE", "REACH"],
    effectiveDate: new Date().toISOString().slice(0, 10),
    riskConditions: decision?.risks ?? [],
    contingency: "If delivery slips beyond 5 days, buyer may activate a secondary supplier without penalty.",
    evidenceSummary: {
      verified: report.verified,
      conflicts: report.conflicts,
      confidence: decision?.confidence ?? 0,
    },
  };
}