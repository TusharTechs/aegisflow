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
 *   DOCTAVIAN_ACCESS_TOKEN   Microsoft OAuth bearer (~1h)
 *   DOCTAVIAN_REFRESH_TOKEN  renews the above without a browser — preferred
 *
 * Either alone is enough. Both come from the SAME Postman dialog but are DIFFERENT
 * strings; the same value does not go in both slots.
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
const ACCESS = process.env.DOCTAVIAN_ACCESS_TOKEN?.trim();
const REFRESH = process.env.DOCTAVIAN_REFRESH_TOKEN?.trim();

if (!KEY) die("DOCTAVIAN_API_KEY is not set.");
if (!ACCESS && !REFRESH)
  die(
    "No Doctavian token set.\n" +
      "  The sign-in is interactive (Microsoft, authorization_code + PKCE), so the\n" +
      "  first token is minted by hand:\n\n" +
      "    1. Doctavian Postman collection -> Authorization -> Get New Access Token\n" +
      "    2. sign in\n" +
      "    3. the dialog shows TWO different strings:\n" +
      "         access_token   -> DOCTAVIAN_ACCESS_TOKEN   (expires in ~1h)\n" +
      "         refresh_token  -> DOCTAVIAN_REFRESH_TOKEN  (renews the above)\n\n" +
      "  Either alone works. The refresh token is better: with it, the bearer\n" +
      "  renews itself instead of lapsing mid-demo."
  );

/** A Microsoft access token is a JWT — three dot-separated base64 segments. */
const looksLikeJwt = (t) => /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(t ?? "");

if (REFRESH && looksLikeJwt(REFRESH)) {
  die(
    "DOCTAVIAN_REFRESH_TOKEN looks like an ACCESS token, not a refresh token.\n" +
      "  It is a JWT (starts `eyJ`, three dot-separated parts) — that is the access\n" +
      "  token. The refresh token is a separate, longer opaque string in the same\n" +
      "  Postman dialog, usually starting `0.A` or `M.C`. They are not interchangeable\n" +
      "  and the same value does not go in both."
  );
}

/** Exchange the refresh token, exactly as the app does. */
async function mintFromRefresh() {
  const res = await fetch(`${BASE}/public/v1/auth/microsoft/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: REFRESH,
      // Azure requires client_id in the BODY for a public client. Postman's
      // "Basic Auth header" default omits it on refresh — that is the AADSTS900144
      // some people hit when using Postman's own Refresh button.
      client_id: process.env.DOCTAVIAN_CLIENT_ID || "11e71170-3499-43f3-b878-7df343f43d37",
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || typeof json?.access_token !== "string") {
    return { ok: false, why: json?.error_description ?? json?.error ?? `HTTP ${res.status}` };
  }
  return { ok: true, token: json.access_token, expiresIn: json.expires_in };
}

let TOKEN = ACCESS;
if (REFRESH) {
  const r = await mintFromRefresh();
  if (r.ok) {
    TOKEN = r.token;
    console.log(`\n✓ refresh token works — minted a bearer good for ~${Math.round((r.expiresIn ?? 3600) / 60)} min`);
  } else {
    console.log(`\n! refresh token rejected (${r.why})`);
    if (!ACCESS) die("and no DOCTAVIAN_ACCESS_TOKEN to fall back on.");
    console.log("  falling back to DOCTAVIAN_ACCESS_TOKEN for this check");
  }
}

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
  REFRESH
    ? "✓ the bearer renews itself — this will still work hours from now"
    : "! no DOCTAVIAN_REFRESH_TOKEN — this bearer expires in ~1h, and when it does the\n  approval step falls back to a local render. Fine for recording now, risky for judging."
);

console.log("\nDoctavian is ready. The agreement template is built and uploaded per run —\nnothing further to configure.\n");
