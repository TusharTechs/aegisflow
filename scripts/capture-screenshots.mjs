#!/usr/bin/env node
/**
 * Capture the README / Devpost gallery.
 *
 *   node scripts/capture-screenshots.mjs                 # against the deployed site
 *   node scripts/capture-screenshots.mjs --local         # against localhost:3000
 *
 * Read-only: it never resets the demo or starts a run, so it costs no sponsor API
 * credits. That does mean the target must already have a completed investigation —
 * if the incident is still in INVESTIGATING the evidence shots will be empty, and
 * the script says so rather than quietly producing blank images.
 */
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const idx = args.indexOf("--url");
const BASE = args.includes("--local")
  ? "http://localhost:3000"
  : (idx >= 0 ? args[idx + 1] : "https://aegisflow-ai.vercel.app").replace(/\/$/, "");

const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const { chromium } = await import("playwright").catch(() => {
  console.error("\n✗ npm i -D playwright && npx playwright install chromium\n");
  process.exit(1);
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
page.setDefaultTimeout(60_000);

const shot = async (file, note) => {
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log(`  ✓ ${file}${note ? `  — ${note}` : ""}`);
};

/** Scroll a section to the top of the frame so the shot is about that section. */
const focus = async (selector) => {
  const el = page.locator(selector).first();
  if (!(await el.count())) return false;
  await el.evaluate((n) => n.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(700);
  return true;
};

console.log(`\ncapturing from ${BASE}\n`);

await page.goto(`${BASE}/incidents/INC-1042`, { waitUntil: "networkidle" });
const investigated = (await page.locator('h2:has-text("Evidence conflict")').count()) > 0;
if (!investigated) {
  console.error(
    "✗ that incident has not been investigated — the evidence shots would be blank.\n" +
      "  Run the response once (press Run Response), then re-run this.\n"
  );
  await browser.close();
  process.exit(1);
}

// 1 — the thesis
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await shot("01-landing.png", "the bet");

// 2 — the incident console
await page.goto(`${BASE}/incidents/INC-1042`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await shot("02-incident.png", "incident console");

// 3 — the money shot
if (await focus('h2:has-text("Evidence conflict")')) {
  await shot("03-conflict.png", "four findings, each naming its rule");
}

// 4 — the stress test, with the gate actually on screen
await page.goto(`${BASE}/incidents/INC-1042/why`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const conflicted = page.locator('button:has-text("Shenzhen")').first();
if (await conflicted.count()) {
  await conflicted.click();
  await page.waitForTimeout(800);
}
// Max the cost weight so the capped score is what the image shows.
await page.evaluate(() => {
  const el = document.querySelectorAll('input[type="range"]')[4];
  if (!el) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, "50");
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(900);
await shot("04-why.png", "cost at max, integrity gate holds at 49/100");

// 5 — the receipts
await page.goto(`${BASE}/integrations`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await shot("05-integrations.png", "every sponsor call on the record");

// 6 — claim-level provenance
await page.goto(`${BASE}/evidence`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await shot("06-evidence.png", "claim-level provenance");

// 7 — append-only trail
await page.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await shot("07-audit.png", "append-only audit trail");

// 8 — why it is a company
await page.goto(`${BASE}/business`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await shot("08-business.png", "the business case");

await browser.close();
console.log(`\ndone → ${OUT}\n`);
