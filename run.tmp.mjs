import { chromium } from "playwright";
const B = "https://aegisflow-ai.vercel.app";
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.setDefaultTimeout(60000);
await p.goto(`${B}/incidents/INC-1042`, { waitUntil: "networkidle" });
if (await p.locator('button:has-text("Reset demo")').count()) {
  await p.click('button:has-text("Reset demo")');
  await p.waitForTimeout(6000);
}
await p.goto(`${B}/incidents/INC-1042`, { waitUntil: "networkidle" });
console.log("ready to run:", (await p.locator('button:has-text("Run Response")').count()) > 0);
await p.click('button:has-text("Run Response")');
console.log("started");
await b.close();
