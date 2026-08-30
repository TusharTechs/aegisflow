// data/demo/pacific-components.ts
import { Incident, WorkflowState } from "@/schemas/core";

export const DEMO_INCIDENT: Incident = {
  id: "INC-1042",
  supplier: "Pacific Components Ltd.",
  affectedProduct: "PX-17 Power Controller",
  status: "CRITICAL",
  inventoryDays: 8,
  revenueExposure: 2400000,
  state: WorkflowState.enum.INVESTIGATING,
  alternativeSuppliers: [
    {
      id: "SUP-A",
      name: "Apex Electronics",
      location: "Germany",
      leadTimeDays: 14,
      costMultiplier: 1.35,
      riskScore: 0,
      claims: [
        { id: "c1", text: "ISO 9001 Certified", source: "Internal Doc", timestamp: "2026-01-15", confidence: 100, status: "VERIFIED" },
        { id: "c2", text: "14-day lead time", source: "Supplier Portal", timestamp: "2026-08-28", confidence: 95, status: "VERIFIED" }
      ]
    },
    {
      id: "SUP-B",
      name: "Nexus Manufacturing",
      location: "Vietnam",
      leadTimeDays: 3,
      costMultiplier: 1.05,
      riskScore: 0,
      claims: [
        { id: "c3", text: "3-day expedited shipping available", source: "Website", timestamp: "2026-08-30", confidence: 91, status: "VERIFIED" },
        { id: "c4", text: "PX-17 direct compatibility", source: "Spec Sheet", timestamp: "2026-05-10", confidence: 94, status: "VERIFIED" }
      ]
    },
    {
      id: "SUP-C",
      name: "Shenzhen Rapid Parts",
      location: "China",
      leadTimeDays: 5,
      costMultiplier: 0.85,
      riskScore: 0,
      claims: [
        { id: "c5", text: "ISO 9001 Certified", source: "Supplier PDF", timestamp: "2024-11-01", confidence: 54, status: "UNVERIFIED", conflictReason: "Independent verification not found on registrar database." },
        { id: "c6", text: "Established 2018", source: "About Us Page", timestamp: "2026-08-30", confidence: 30, status: "CONFLICT", conflictReason: "Business registration shows entity formed in 2021." }
      ]
    }
  ],
  auditLog: [
    { timestamp: "2026-08-30T14:32:01Z", event: "Incident created: Pacific Components disruption", actor: "SYSTEM" }
  ]
};