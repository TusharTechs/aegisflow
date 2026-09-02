import { chromium } from "playwright";
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.setDefaultTimeout(50000);
await p.goto("https://aegisflow-ai.vercel.app/incidents/INC-1042", { waitUntil: "networkidle" });
if (await p.locator('button:has-text("Reset demo")').count()) {
  await p.click('button:has-text("Reset demo")');
  await p.waitForTimeout(6000);
}
await b.close();
console.log("reset done");
