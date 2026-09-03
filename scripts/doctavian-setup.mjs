#!/usr/bin/env node
/**
 * Check that Doctavian credentials work.
 *
 * There is nothing else to set up: the demo environment consumes an uploaded
 * template on first use, so the app builds and uploads one per generation
 * (lib/documents/doctavian-template.ts). The only thing that expires is the
 * bearer, which is what this verifies.
 *
 *   node scripts/doctavian-setup.mjs
 *
 * Requires in .env:
 *   DOCTAVIAN_API_KEY        subscription key
 *   DOCTAVIAN_ACCESS_TOKEN   Microsoft OAuth bearer — mint via "Get New Access
 *                            Token" in Doctavian's Postman collection
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
console.log(
  process.env.DOCTAVIAN_REFRESH_TOKEN?.trim()
    ? "✓ DOCTAVIAN_REFRESH_TOKEN set — the bearer renews itself"
    : "! no DOCTAVIAN_REFRESH_TOKEN — this bearer expires in ~1h and the demo will\n  fall back to a local render when it does"
);

console.log("\nDoctavian is ready. The agreement template is built and uploaded per run —\nnothing further to configure.\n");
