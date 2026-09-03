#!/usr/bin/env node
/**
 * Drive the AegisFlow demo for a screen recording, on a fixed schedule.
 *
 * Every scene has a start and end second that does not move. The script does its
 * work inside the scene and then waits out the remainder, so two runs produce the
 * same timings — which means you can write the voiceover BEFORE you record, then
 * read it against the clock.
 *
 *   node scripts/demo-drive.mjs --script       # print the schedule and exit
 *   node scripts/demo-drive.mjs                # record against the deployed site
 *   node scripts/demo-drive.mjs --local        # against localhost:3000
 *   node scripts/demo-drive.mjs --manual-sign  # pause so you click Sign yourself
 *   node scripts/demo-drive.mjs --rehearse     # half-length, to check it runs
 *   node scripts/demo-drive.mjs --delay 15     # seconds of lead-in (default 10)
 *
 * First run downloads Chromium: npx playwright install chromium
 *
 * The one variable is the investigation itself (live APIs, usually 15-25s). Scene 3
 * budgets 40s for it. If it overruns, the script says so and later scenes shift —
 * rerun rather than fighting it.
 */
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argOf = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const BASE = has("--local")
  ? "http://localhost:3000"
  : argOf("--url", "https://aegisflow-ai.vercel.app").replace(/\/$/, "");
const INCIDENT = argOf("--incident", "INC-1042");
const MANUAL_SIGN = has("--manual-sign");
const SCALE = has("--rehearse") ? 0.5 : 1;
/** Lead-in after the browser opens: full-screen it and park the cursor off-frame. */
const DELAY = Math.max(0, Number(argOf("--delay", "10")));

const SIGNER = { name: "Tushar Agarwal", title: "VP Supply Chain Risk", email: "" };

/**
 * The schedule. `end` is the second the scene hands over to the next one.
 * `say` is the voiceover cue — roughly what fits in that window at speaking pace.
 */
const SCENES = [
  {
    end: 8,
    title: "The bet",
    say: "Everyone is selling you an autonomous procurement agent. Nobody in a regulated supply chain will let one commit spend. AegisFlow makes the opposite bet.",
  },
  {
    end: 18,
    title: "The incident",
    say: "A single-source supplier just failed. Eight days of inventory. Two point four million dollars of exposure. Normally this is four hours of cross-functional scrambling.",
  },
  {
    end: 58,
    title: "The investigation",
    say: "One click. Six agents. SerpApi searches the live web, name.com checks whether each supplier owns the domain it trades under, Nutrient extracts the fields from six supplier PDFs, and every claim gets cross-checked. These are real API calls, happening now.",
  },
  {
    end: 93,
    title: "The conflict",
    say: "Here is what it found. The cheapest supplier — the one a cost-first model picks — claims it was established in 2018. Its own business registration says 2021. Its ISO certificate has no registry match. It has almost no web corroboration. And the domain it would trade under is still available to buy. Four independent systems disagree with this supplier, and each verdict names the rule that produced it.",
  },
  {
    end: 118,
    title: "The stress test",
    say: "The risk model is fully transparent, and you can re-weight it live. Drag cost to maximum — the setting that should favour the cheapest supplier. It still loses. A supplier carrying an unresolved evidence conflict is capped at forty-nine out of a hundred. You cannot weight your way to a bad supplier.",
  },
  {
    end: 138,
    title: "The handoff",
    say: "Then the AI stops. Approve, reject and sign are human-only transitions, enforced by a state machine, not a prompt. On approval, Doctavian generates the transition agreement from the structured decision payload — and it prints an unverified-claims notice on its face, because this run found a conflict.",
  },
  {
    end: 153,
    title: "The signature",
    say: "AegisFlow prepared this agreement and prepared the signing request. It cannot sign. Foxit's own MCP server leaves signing out of the agent toolset, and we enforce that boundary in code — no non-human actor reaches an eSign folder from any state.",
  },
  {
    end: 175,
    title: "The receipts",
    say: "And none of this asks you to take our word for it. Every sponsor API call is on the record with its real request and response, tagged for whether it ran live. Plus an append-only audit trail. AI prepares. Humans authorize.",
  },
];

const T = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s) % 60).padStart(2, "0")}`;

if (has("--script")) {
  let from = 0;
  console.log(`\nAegisFlow — demo script (total ${T(SCENES[SCENES.length - 1].end)})\n${"=".repeat(64)}`);
  for (const s of SCENES) {
    console.log(`\n${T(from)} – ${T(s.end)}   ${s.title.toUpperCase()}  (${s.end - from}s)`);
    console.log(`  ${s.say}`);
    from = s.end;
  }
  console.log(`\n${"=".repeat(64)}\nRun without --script to drive the browser on these timings.\n`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const actual = [];

/** Wait out the rest of a scene so the next one starts exactly on time. */
async function holdUntil(second, title) {
  const target = second * SCALE;
  const over = clock() - target;
  if (over > 1.5) console.log(`      ⚠  "${title}" ran ${over.toFixed(1)}s long — later scenes shift`);
  await sleep((target - clock()) * 1000);
}

// ── page helpers ──────────────────────────────────────────────────────────────
// These go through Playwright locators, not document.querySelector: `:has-text()`
// and `:text-is()` are Playwright selector engines and are not valid native CSS.
async function reveal(page, selector, block = "center") {
  const el = page.locator(selector).first();
  if (!(await el.count())) return;
  await el.evaluate((node, blk) => node.scrollIntoView({ behavior: "smooth", block: blk }), block);
  await sleep(700 * SCALE);
}

async function spotlight(page, selector, ms = 1500) {
  const d = ms * SCALE;
  const el = page.locator(selector).first();
  if (!(await el.count())) {
    await sleep(d);
    return;
  }
  await el.evaluate((node, dur) => {
    const prev = node.style.cssText;
    node.style.transition = "box-shadow .25s ease";
    node.style.boxShadow = "0 0 0 3px rgba(59,130,246,.9), 0 0 28px rgba(59,130,246,.45)";
    node.style.borderRadius = "10px";
    setTimeout(() => (node.style.cssText = prev), dur);
  }, d);
  await sleep(d + 120);
}

/** React-controlled range input: native setter + a bubbled input event. */
async function slide(page, index, to, steps = 16) {
  for (let i = 1; i <= steps; i++) {
    await page.evaluate(
      ([idx, val]) => {
        const el = document.querySelectorAll('input[type="range"]')[idx];
        if (!el) return;
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, String(val));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
      [index, Math.round((to * i) / steps)]
    );
    await sleep(60 * SCALE);
  }
}

/**
 * Wait for the run to finish and the conflict panel to be on screen.
 *
 * The console streams client-side and calls router.refresh() when it is done, but
 * that refresh can be served by a warm instance whose copy of the incident predates
 * the run — so the stream says "Human review required" while the page still shows
 * the pre-run state. Reloading is the reliable signal.
 */
async function waitForConflictPanel(page, budgetMs = 90_000) {
  const panel = 'h2:has-text("Evidence conflict")';
  const deadline = Date.now() + budgetMs;
  let reloadedAt = 0;
  while (Date.now() < deadline) {
    if (page.isClosed()) throw new Error("the browser window was closed");
    if (await page.locator(panel).count()) return;
    const done = await page.locator(':text("Human review required")').count();
    // Once the stream is finished, reload every few seconds until the server agrees.
    if (done && Date.now() - reloadedAt > 5000) {
      reloadedAt = Date.now();
      await page.reload({ waitUntil: "networkidle" }).catch(() => {});
    }
    await sleep(1200);
  }
  throw new Error(
    "the investigation finished but the conflict panel never rendered — " +
      "check that the incident left INVESTIGATING and that Xano is reachable"
  );
}

const exists = async (page, sel) => (await page.locator(sel).count()) > 0;

// ── run ───────────────────────────────────────────────────────────────────────
console.log(`
AegisFlow demo driver
  target   : ${BASE}
  duration : ${T(SCENES[SCENES.length - 1].end * SCALE)}${has("--rehearse") ? "  (rehearsal)" : ""}
  sign     : ${MANUAL_SIGN ? "you click it" : "automatic"}

Run with --script first to get the voiceover text and timings.

Press Enter and the browser opens on the landing page. You then get ${DELAY}s to
full-screen it, start your recorder, and move the cursor off the frame — the
clock does not start until the countdown ends.
`);
await new Promise((r) => process.stdin.once("data", r));

const { chromium } = await import("playwright").catch(() => {
  console.error(
    "\n✗ Playwright is not installed.\n" +
      "    npm i -D playwright && npx playwright install chromium\n"
  );
  process.exit(1);
});

const browser = await chromium.launch({
  headless: false,
  args: ["--window-size=1512,982", "--window-position=0,0", "--force-device-scale-factor=2"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(120_000);

// Silent setup — happens before the clock starts, and before the lead-in, so the
// countdown is dead time the recorder can capture rather than a page mid-reset.
await page.goto(`${BASE}/incidents/${INCIDENT}`, { waitUntil: "networkidle" });
if (await exists(page, 'button:has-text("Reset demo")')) {
  await page.click('button:has-text("Reset demo")');
  await sleep(4000);
}
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

if (DELAY > 0) {
  process.stdout.write("\n");
  for (let i = DELAY; i > 0; i--) {
    process.stdout.write(`\r  starting in ${String(i).padStart(2)}s — full-screen the browser, move the cursor away   `);
    await sleep(1000);
  }
  process.stdout.write("\r  recording now" + " ".repeat(60) + "\n");
}

const start = Date.now();
const clock = () => (Date.now() - start) / 1000;
const mark = (title) => {
  actual.push({ at: clock(), title });
  console.log(`  ${T(clock())}  ${title}`);
};

console.log("\nrecording\n---------");

try {
  // 1 — the bet
  mark(SCENES[0].title);
  await reveal(page, "#how", "start");
  await holdUntil(SCENES[0].end, SCENES[0].title);

  // 2 — the incident
  mark(SCENES[1].title);
  await page.goto(`${BASE}/incidents/${INCIDENT}`, { waitUntil: "networkidle" });
  await sleep(1200 * SCALE);
  await spotlight(page, 'div.rounded-lg.border:has-text("Inventory remaining")', 1800);
  await holdUntil(SCENES[1].end, SCENES[1].title);

  // 3 — the investigation (the one variable-length scene)
  mark(SCENES[2].title);
  await page.click('button:has-text("Run Response")');
  await sleep(1000 * SCALE);
  await reveal(page, 'div.rounded-lg.border:has-text("AI response status")');
  await waitForConflictPanel(page);
  await holdUntil(SCENES[2].end, SCENES[2].title);

  // 4 — the conflict
  mark(SCENES[3].title);
  await reveal(page, 'h2:has-text("Evidence conflict")', "start");
  for (const label of [
    "ISO 9001 Certified",
    "Established 2018",
    "Independent web corroboration",
    "shenzhenrapidparts.com",
  ]) {
    const sel = `div:has(> p:text-is("${label}"))`;
    if (await exists(page, sel)) await spotlight(page, sel, 1900);
    else await sleep(1500 * SCALE);
  }
  await holdUntil(SCENES[3].end, SCENES[3].title);

  // 5 — the stress test
  mark(SCENES[4].title);
  await page.goto(`${BASE}/incidents/${INCIDENT}/why`, { waitUntil: "networkidle" });
  await sleep(1200 * SCALE);
  // The gate panel belongs to the conflicted supplier, and the default selection
  // is the recommended one — pick Shenzhen so the cap is on screen.
  const conflicted = page.locator('button:has-text("Shenzhen")').first();
  if (await conflicted.count()) {
    await conflicted.click();
    await sleep(1200 * SCALE);
  }
  await reveal(page, 'input[type="range"]');
  await slide(page, 4, 50); // cost is the 5th dimension
  await sleep(1800 * SCALE);
  if (await exists(page, 'p:has-text("Integrity gate active")')) {
    await spotlight(page, 'div:has(> p:text-is("Integrity gate active"))', 2400);
  }
  await holdUntil(SCENES[4].end, SCENES[4].title);

  // 6 — the handoff
  mark(SCENES[5].title);
  await page.goto(`${BASE}/incidents/${INCIDENT}`, { waitUntil: "networkidle" });
  await sleep(1000 * SCALE);
  await reveal(page, 'button:has-text("Approve transition")');
  await spotlight(page, 'button:has-text("Approve transition")', 1400);
  await page.click('button:has-text("Approve transition")');
  await page.waitForSelector('button:has-text("Sign agreement")', { timeout: 90_000 });
  await reveal(page, 'button:has-text("Sign agreement")');
  await holdUntil(SCENES[5].end, SCENES[5].title);

  // 7 — the signature
  mark(SCENES[6].title);
  if (await exists(page, 'p:has-text("Only an authorized human can sign it")')) {
    await spotlight(page, 'p:has-text("Only an authorized human can sign it")', 2200);
  }
  await page.fill('input[name="signerName"]', SIGNER.name);
  await sleep(400 * SCALE);
  await page.fill('input[name="signerTitle"]', SIGNER.title);
  await sleep(400 * SCALE);
  if (SIGNER.email) await page.fill('input[name="signerEmail"]', SIGNER.email);
  await page.check('input[name="authorized"]');
  await sleep(700 * SCALE);
  if (MANUAL_SIGN) {
    console.log('\n      ⏸  click "Sign agreement" yourself, then press Enter here\n');
    await new Promise((r) => process.stdin.once("data", r));
  } else {
    await page.click('button:has-text("Sign agreement")');
  }
  await page.waitForSelector('p:has-text("Signed")', { timeout: 90_000 });
  await holdUntil(SCENES[6].end, SCENES[6].title);

  // 8 — the receipts
  mark(SCENES[7].title);
  await page.goto(`${BASE}/integrations`, { waitUntil: "networkidle" });
  await sleep(1800 * SCALE);
  await reveal(page, 'h2:has-text("Integration Activity Ledger"), :text("Integration Activity Ledger")', "start");
  await sleep(2000 * SCALE);
  await page.mouse.wheel(0, 650);
  await sleep(2200 * SCALE);
  await page.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
  await holdUntil(SCENES[7].end, SCENES[7].title);
} catch (err) {
  console.error(`\n✗ ${err.message}\n  Browser left open so you can see where it stopped.`);
}

console.log(`\n\nACTUAL vs PLANNED\n${"=".repeat(52)}`);
let from = 0;
SCENES.forEach((s, i) => {
  const a = actual[i];
  const drift = a ? a.at - from * SCALE : null;
  console.log(
    `${T(from * SCALE)} – ${T(s.end * SCALE)}  ${s.title.padEnd(18)}` +
      (drift === null ? "  (not reached)" : `  started ${drift >= 0 ? "+" : ""}${drift.toFixed(1)}s`)
  );
  from = s.end;
});
console.log(`\nTotal ${T(clock())}. Stop the recorder. Ctrl-C to close the browser.\n`);
await new Promise(() => {});
