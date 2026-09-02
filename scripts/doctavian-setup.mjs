#!/usr/bin/env node
/**
 * Doctavian one-time setup.
 *
 * Doctavian generates from an uploaded template addressed by URN, so there is a
 * setup step before the app can go LIVE. This script does all of it:
 *
 *   1. checks the credentials actually work
 *   2. uploads your agreement template (.docx) and prints its URN
 *   3. smoke-tests a real generation with a sample decision payload
 *
 * Usage:
 *   node scripts/doctavian-setup.mjs path/to/agreement-template.docx
 *   node scripts/doctavian-setup.mjs --check          # credentials only
 *
 * Requires in .env (or the environment):
 *   DOCTAVIAN_API_BASE       https://demo.api.doctavian.com
 *   DOCTAVIAN_API_KEY        subscription key
 *   DOCTAVIAN_ACCESS_TOKEN   Microsoft OAuth bearer — mint it once via
 *                            "Get New Access Token" in the Doctavian Postman
 *                            collection, then paste it here.
 */
import fs from "node:fs/promises";
import path from "node:path";

// Minimal .env loader — this script runs outside Next, which does it for us.
async function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = await fs.readFile(path.join(process.cwd(), file), "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
    } catch {
      /* file absent — fine */
    }
  }
}

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

await loadEnv();

const BASE = (process.env.DOCTAVIAN_API_BASE || "https://demo.api.doctavian.com").replace(/\/$/, "");
const KEY = process.env.DOCTAVIAN_API_KEY;
const TOKEN = process.env.DOCTAVIAN_ACCESS_TOKEN;

if (!KEY) die("DOCTAVIAN_API_KEY is not set.");
if (!TOKEN)
  die(
    "DOCTAVIAN_ACCESS_TOKEN is not set.\n" +
      "  Doctavian's OAuth flow is interactive (Microsoft, authorization_code + PKCE),\n" +
      "  so the bearer has to be minted by hand once:\n\n" +
      "    1. open the Doctavian Postman collection\n" +
      "    2. Authorization tab → Get New Access Token → sign in\n" +
      "    3. copy the token into DOCTAVIAN_ACCESS_TOKEN in .env"
  );

const headers = (extra = {}) => ({ "X-Api-Key": KEY, Authorization: `Bearer ${TOKEN}`, ...extra });

async function call(method, endpoint, { body, form } = {}) {
  const res = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: form ? headers() : headers(body ? { "Content-Type": "application/json" } : {}),
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

function pickUrn(json) {
  const at = (p) => p.reduce((n, k) => (n && typeof n === "object" ? n[k] : undefined), json);
  for (const p of [
    ["result", "data", "document", "urn"],
    ["result", "data", "urn"],
    ["result", "data", "id"],
    ["data", "document", "urn"],
    ["data", "urn"],
    ["data", "id"],
    ["urn"],
    ["id"],
  ]) {
    const v = at(p);
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

// ── 1. credentials ────────────────────────────────────────────────
console.log(`\n→ ${BASE}`);
const check = await call("GET", "/v1/documents/template/list");
if (check.status === 401) {
  die(
    "401 Unauthorized. The bearer is missing or expired — mint a fresh one from the\n" +
      "  Doctavian Postman collection (Authorization → Get New Access Token)."
  );
}
if (!check.ok) die(`Template list failed: HTTP ${check.status}\n${JSON.stringify(check.json, null, 2).slice(0, 600)}`);
console.log("✓ credentials accepted (X-Api-Key + OAuth bearer)");

const templatePath = process.argv[2];
if (!templatePath || templatePath === "--check") {
  console.log("\nCredentials are good. Re-run with a template to finish setup:");
  console.log("  node scripts/doctavian-setup.mjs path/to/agreement-template.docx\n");
  process.exit(0);
}

// ── 2. upload the template ────────────────────────────────────────
const bytes = await fs.readFile(templatePath).catch(() => die(`Cannot read ${templatePath}`));
const form = new FormData();
form.append(
  "file",
  new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }),
  path.basename(templatePath)
);

const upload = await call("POST", "/v1/documents/template/upload", { form });
if (!upload.ok) die(`Template upload failed: HTTP ${upload.status}\n${JSON.stringify(upload.json, null, 2).slice(0, 600)}`);

const templateUrn = pickUrn(upload.json);
if (!templateUrn) die(`Upload succeeded but no URN in the response:\n${JSON.stringify(upload.json, null, 2).slice(0, 600)}`);

console.log(`✓ template uploaded\n`);
console.log(`  Paste this into .env:\n`);
console.log(`    DOCTAVIAN_TEMPLATE_URN=${templateUrn}\n`);

// ── 3. smoke-test a real generation ───────────────────────────────
const samplePayload = {
  agreementId: "AGR-SMOKE-TEST",
  buyer: "Meridian Manufacturing Co.",
  supplier: "Nexus Manufacturing Co. Ltd",
  product: "PX-17 Power Controller",
  quantity: 1500,
  unitPrice: 90.3,
  totalValue: 135450,
  deliveryDeadlineDays: 5,
  sla: "98% on-time delivery; 24-hour disruption notice",
  compliance: ["ISO 9001:2015", "RoHS", "CE"],
  effectiveDate: new Date().toISOString().slice(0, 10),
  riskConditions: ["Single-source dependency during transition"],
  contingency: "Buyer may activate a secondary supplier without penalty after 5 days.",
  evidenceSummary: { verified: 8, conflicts: 1, confidence: 91 },
};

// Same wrapping the app uses: { data: { Agreement: [ ...fields ] } }
const dataForm = new FormData();
dataForm.append(
  "file",
  new Blob([JSON.stringify({ data: { Agreement: [samplePayload] } }, null, 2)], { type: "application/json" }),
  "smoke-test.json"
);
const dataUpload = await call("POST", "/v1/documents/data/upload", { form: dataForm });
if (!dataUpload.ok) {
  console.log(`! data upload failed (HTTP ${dataUpload.status}) — template URN above is still valid.`);
  process.exit(0);
}
const dataUrn = pickUrn(dataUpload.json);
console.log(`✓ sample data uploaded (${dataUrn})`);

const generate = await call("POST", "/v1/documents/document/generate", {
  body: {
    externalContext: { id: samplePayload.agreementId },
    template: {
      name: path.basename(templatePath),
      urn: templateUrn,
      fileFormat: "docx",
      loadMethod: "Storage",
      options: {},
    },
    data: { loadMethod: "Storage", urn: dataUrn },
    document: {
      name: "aegisflow-smoke-test",
      fileFormat: "pdf",
      deliveryMethod: "Storage",
      path: "root",
      locale: "en",
      timezone: "UTC",
      options: {},
    },
  },
});

if (!generate.ok) {
  console.log(`\n! generate returned HTTP ${generate.status}:`);
  console.log(JSON.stringify(generate.json, null, 2).slice(0, 800));
  console.log(`\n  The template URN above is valid — this usually means the template's`);
  console.log(`  Elements don't match the payload field names. Fix the template, no re-upload needed.\n`);
  process.exit(0);
}

console.log(`✓ generated document: ${pickUrn(generate.json)}`);
console.log(`\nDoctavian is live. Set DOCTAVIAN_TEMPLATE_URN and restart the dev server.\n`);
