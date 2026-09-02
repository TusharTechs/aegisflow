import { chromium } from "playwright";
const B = "https://aegisflow-ai.vercel.app";
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.setDefaultTimeout(60000);
await p.goto(`${B}/incidents/INC-1042`, { waitUntil: "networkidle" });
// no Run Response — this only checks whether a stale mirror now self-corrects
const t0 = Date.now();
for (let i = 0; i < 20; i++) {
  const n = await p.locator('h2:has-text("Evidence conflict")').count();
  console.log(`${((Date.now()-t0)/1000).toFixed(0)}s  panel=${n}`);
  if (n > 0) { console.log("PANEL VISIBLE — stale mirror self-corrected"); break; }
  await p.waitForTimeout(4000);
  await p.reload({ waitUntil: "networkidle" });
}
await b.close();
