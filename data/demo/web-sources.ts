import { ExternalSource } from "@/schemas/core";

export type Intent = "market" | "news" | "supplier";
type Seeded = Omit<ExternalSource, "id" | "observedAt"> & { intent: Intent };

const SEEDED: Seeded[] = [
  // market
  { intent: "market", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 84, title: "Industrial power controller distributors — market overview", url: "demo://market/power-controllers", snippet: "Multiple qualified manufacturers exist; typical lead times 3–14 days for assembled controllers." },
  { intent: "market", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 87, title: "PX-17 equivalent parts cross-reference", url: "demo://market/px17-crossref", snippet: "Cross-reference lists NX-P17 (Nexus Manufacturing) and AX-1700 (Apex Electronics) as qualified equivalents." },
  { intent: "market", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 75, title: "Component shortage outlook — power management", url: "demo://market/shortage-outlook", snippet: "Power management supply normalized; contract assembly capacity stable Q3 2026." },
  // news
  { intent: "news", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 90, title: "Pacific Components — disruption monitoring bulletin", url: "demo://news/pacific-bulletin", snippet: "Production halt reported at Pacific Components Ltd; recovery timeline unknown." },
  { intent: "news", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 66, title: "No public customer notices found on Pacific Components status", url: "demo://news/pacific-scan", snippet: "Automated scan found no official statements in the past 72 hours." },
  // SUP-A
  { intent: "supplier", supplierId: "SUP-A", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 90, title: "Apex Electronics GmbH — trade registry extract", url: "demo://registry/apex", snippet: "Active registration since 2009. Industrial electronics manufacturer, Munich." },
  { intent: "supplier", supplierId: "SUP-A", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 92, title: "ISO 9001:2015 certificate directory — Apex Electronics GmbH", url: "demo://certdir/apex", snippet: "Certificate valid through 2027-03. Issuing body: TÜV Rheinland." },
  { intent: "supplier", supplierId: "SUP-A", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 78, title: "Apex Electronics — EU supplier directory listing", url: "demo://directory/apex", snippet: "Product lines include industrial power controllers." },
  // SUP-B
  { intent: "supplier", supplierId: "SUP-B", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 91, title: "Nexus Manufacturing Co. Ltd — trade registry extract", url: "demo://registry/nexus", snippet: "Active registration since 2016. Electronics assembly & export, Hanoi." },
  { intent: "supplier", supplierId: "SUP-B", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 94, title: "Nexus Manufacturing — PX-series compatibility listing", url: "demo://listing/nexus", snippet: "Lists NX-P17 as PX-17 equivalent; datasheet available." },
  { intent: "supplier", supplierId: "SUP-B", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 71, title: "Vietnam electronics export growth — market brief", url: "demo://market/vn-electronics", snippet: "Contract electronics capacity expanded 18% YoY." },
  // SUP-C — the external side of the conflict
  { intent: "supplier", supplierId: "SUP-C", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 93, title: "Shenzhen Rapid Parts Ltd — trade registry extract", url: "demo://registry/shenzhen", snippet: "Entity formed 2021-06. Status: active." },
  { intent: "supplier", supplierId: "SUP-C", query: "", engine: "demo-registry", mode: "DEMO SEEDED", relevance: 89, title: "ISO 9001 certificate directory — no record found for Shenzhen Rapid Parts", url: "demo://certdir/shenzhen", snippet: "Query returned 0 matching certificates as of snapshot date." },
];

export function seededSourcesFor(intent: Intent, query: string, supplierId?: string): Omit<ExternalSource, "id" | "observedAt">[] {
  return SEEDED
    .filter((s) => s.intent === intent && (intent !== "supplier" || s.supplierId === supplierId))
    .map(({ intent: _i, ...rest }) => ({ ...rest, query, supplierId }));
}