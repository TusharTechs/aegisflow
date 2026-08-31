// Capture the README screenshots from a locally running instance.
//   npm i -D puppeteer          (one-time — not a project dependency)
//   npm run dev                 (in another terminal)
//   node scripts/capture-screenshots.mjs
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const shots = [
  { file: "01-landing.png", path: "/", wait: 500 },
  { file: "02-incident.png", path: "/incidents/INC-1042", wait: 900 },
  { file: "03-why.png", path: "/incidents/INC-1042/why", wait: 900 },
  { file: "04-integrations.png", path: "/integrations", wait: 900 },
  { file: "05-evidence.png", path: "/evidence", wait: 900 },
  { file: "06-audit.png", path: "/audit", wait: 700 },
];

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

// Make sure the golden scenario has been investigated so the screens have content.
await page.goto(`${BASE}/incidents/INC-1042`, { waitUntil: "networkidle2" });
try {
  const resetBtn = await page.$$("button");
  for (const b of resetBtn) {
    const t = await page.evaluate((el) => el.textContent, b);
    if (/reset demo/i.test(t)) { await b.click(); break; }
  }
  await new Promise((r) => setTimeout(r, 3500));
  await page.evaluate((base) => fetch(`${base}/api/incidents/INC-1042/investigate`).then((r) => r.text()), BASE);
  await new Promise((r) => setTimeout(r, 1500));
} catch (e) {
  console.warn("pre-seed step skipped:", e.message);
}

for (const s of shots) {
  await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, s.wait));
  await page.screenshot({ path: `${OUT}/${s.file}` });
  console.log("→", `${OUT}/${s.file}`);
}

await browser.close();
