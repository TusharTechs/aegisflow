// One-time Xano seeder. Run AFTER adding the fields to the four tables
// (see docs/xano-setup.md). Paces writes for the free tier (10 req / 20s),
// then you can set XANO_AUTO_SEED=false so the app never seeds at runtime.
//
//   node scripts/seed-xano.mjs
//
// Reads XANO_API_BASE / XANO_API_TOKEN from .env / .env.local / the environment.

import { readFileSync } from "node:fs";

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}
loadEnv(".env.local");
loadEnv(".env");

const BASE = process.env.XANO_API_BASE;
const TOKEN = process.env.XANO_API_TOKEN;
if (!BASE) {
  console.error("XANO_API_BASE not set. Add it to .env, then re-run.");
  process.exit(1);
}

const DELAY = Number(process.env.XANO_SEED_DELAY_MS ?? 2200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// The golden-scenario dataset (mirrors data/demo/pacific-components.ts).
const INCIDENT = {
  incident_key: "INC-1042", supplier: "Pacific Components Ltd.", affected_product: "PX-17 Power Controller",
  status: "CRITICAL", inventory_days: 8, revenue_exposure: 2400000, state: "INVESTIGATING", evidence_json: null,
};
const SUPPLIERS = [
  { supplier_key: "SUP-A", name: "Apex Electronics", location: "Germany", lead_time_days: 14, cost_multiplier: 1.35,
    claims: [
      { claim_key: "c1", text: "ISO 9001 Certified", source: "Internal Doc", ts: "2026-01-15", confidence: 100, status: "VERIFIED", conflict_reason: "" },
      { claim_key: "c2", text: "14-day lead time", source: "Supplier Portal", ts: "2026-08-28", confidence: 95, status: "VERIFIED", conflict_reason: "" },
    ] },
  { supplier_key: "SUP-B", name: "Nexus Manufacturing", location: "Vietnam", lead_time_days: 3, cost_multiplier: 1.05,
    claims: [
      { claim_key: "c3", text: "3-day expedited shipping available", source: "Website", ts: "2026-08-30", confidence: 91, status: "VERIFIED", conflict_reason: "" },
      { claim_key: "c4", text: "PX-17 direct compatibility", source: "Spec Sheet", ts: "2026-05-10", confidence: 94, status: "VERIFIED", conflict_reason: "" },
    ] },
  { supplier_key: "SUP-C", name: "Shenzhen Rapid Parts", location: "China", lead_time_days: 5, cost_multiplier: 0.85,
    claims: [
      { claim_key: "c5", text: "ISO 9001 Certified", source: "Supplier PDF", ts: "2024-11-01", confidence: 54, status: "UNVERIFIED", conflict_reason: "Independent verification not found on registrar database." },
      { claim_key: "c6", text: "Established 2018", source: "About Us Page", ts: "2026-08-30", confidence: 30, status: "CONFLICT", conflict_reason: "Business registration shows entity formed in 2021." },
    ] },
];

async function main() {
  console.log(`Seeding ${BASE} (${DELAY}ms between writes for the free-tier limit)…`);

  const existing = await req("GET", "/incident");
  if (Array.isArray(existing) && existing.some((r) => r.incident_key === "INC-1042")) {
    console.log("INC-1042 already present — nothing to do.");
    return;
  }
  if (Array.isArray(existing) && existing.length && existing.every((r) => !("incident_key" in r))) {
    console.error("The `incident` table has no `incident_key` field. Add the columns from docs/xano-setup.md first.");
    process.exit(1);
  }

  const inc = await req("POST", "/incident", INCIDENT);
  console.log(`  incident #${inc.id}`);
  for (const s of SUPPLIERS) {
    await sleep(DELAY);
    const { claims, ...srow } = s;
    const sup = await req("POST", "/supplier", {
      incident_id: inc.id, ...srow, risk_score: 0, recommendation: false, recommendation_reasoning: "",
    });
    console.log(`  supplier ${s.supplier_key} #${sup.id}`);
    for (const c of claims) {
      await sleep(DELAY);
      await req("POST", "/claim", { supplier_id: sup.id, ...c, document_evidence: null });
      console.log(`    claim ${c.claim_key}`);
    }
  }
  await sleep(DELAY);
  await req("POST", "/audit_event", {
    incident_id: inc.id, event_ts: new Date().toISOString(),
    event: "Incident seeded from AegisFlow demo dataset", actor: "SYSTEM",
  });
  console.log("Done. Set XANO_AUTO_SEED=false and restart the app.");
}

main().catch((e) => {
  console.error("\nSeed failed:", e.message);
  process.exit(1);
});
