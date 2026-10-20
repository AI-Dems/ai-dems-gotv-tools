#!/usr/bin/env node
/**
 * The line scraper. Every few minutes it reads LBJ's "Line Lengths by Hour"
 * dashboard and POSTs every location's latest report to the Sheet
 * (apps-script/Api.js, action "lines"). The Sheet does the matching, the
 * ranking and the snapshots; this program only reads a web page.
 *
 * It runs HEADED with its own persistent browser profile (profile/), so you
 * log into LBJ once in the window it opens and stay logged in.
 *
 *   npm start | npm run once | npm run check | npm run pick     (see src/config.mjs)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { USAGE, parseArgv, loadEnv, sheetConfig, todayIn } from "./src/config.mjs";
import { SheetClient } from "./src/sheet.mjs";
import { lineTableReady, extractLineRows, linePagerState, lineDateFilter, currentElectionName,
         parseFilterDate, buildPayload } from "./src/lbj.mjs";
import { makeAlerter } from "./src/alert.mjs";
import { lockHolder, takeLock, releaseLock } from "./src/runlock.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PAGE_SIZE = 10, MAX_PAGES = 100;

const args = parseArgv(process.argv.slice(2));
if (args.help) { console.log(USAGE); process.exit(0); }
const env = loadEnv();
const sheet = new SheetClient(env);
const alert = makeAlerter({ speak: process.env.LBJ_SPEAK !== "0" });
const log = (m) => console.log(`${new Date().toISOString()} ${m}`);
const dashUrl = `${env.lbjUrl}/dashboard/recent_line_lengths`;

fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
const LOCK = path.join(ROOT, "logs", "runner.lock");
const holder = lockHolder(LOCK);
if (holder) { console.error(`another runner is already going (PID ${holder}). Stop it with npm stop.`); process.exit(3); }
takeLock(LOCK);

for (const kind of ["unhandledRejection", "uncaughtException"]) {
  process.on(kind, (err) => {
    log(`${kind}: ${err && err.stack || err}`);
    alert("crash", `the line scraper crashed: ${err && err.message || err}`);
    releaseLock(LOCK);
    process.exit(1);
  });
}

const context = await chromium.launchPersistentContext(path.join(ROOT, "profile"), {
  headless: process.env.LBJ_HEADLESS === "1",   // for the offline mock only
  viewport: null,
  args: ["--disable-blink-features=AutomationControlled"]
});
const page = context.pages()[0] || (await context.newPage());
let closing = false;
context.on("close", () => { if (!closing) { log("browser closed — exiting"); releaseLock(LOCK); process.exit(1); } });
process.on("SIGTERM", async () => { closing = true; await context.close().catch(() => {}); releaseLock(LOCK); process.exit(0); });

/** Load the dashboard, nagging (with alerts) until a live LBJ session shows it. */
async function loadDashboard(cfg) {
  await page.goto(dashUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  for (let waited = 0; ; waited += 5000) {
    if (await page.evaluate(lineTableReady).catch(() => false)) break;
    if (waited >= 20000) {
      alert("login", "LBJ's line dashboard is not loading — sign in or fix it in the scraper's browser window.");
      await page.waitForTimeout(10000);
      await page.goto(dashUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      waited = 0;
    } else {
      await page.waitForTimeout(5000);
    }
  }
  if (cfg.lbjElectionName) {
    const el = await page.evaluate(currentElectionName).catch(() => "");
    if (el && !el.includes(cfg.lbjElectionName)) {
      throw new Error(`LBJ is switched to "${el}", but Setup says "${cfg.lbjElectionName}" — change it in LBJ's top-left dropdown`);
    }
  }
}

/** --pick: you set the filters, stay on page 1, press Enter here. */
async function pickPage() {
  await page.goto(dashUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  console.log("\nSet the filters in the browser window (e.g. Date = a past election day), stay on page 1, then press Enter here.");
  await new Promise((resolve) => process.stdin.once("data", resolve));
  process.stdin.pause();
  if (!(await page.evaluate(lineTableReady).catch(() => false))) throw new Error("the window shows no line table — is it on Line Lengths by Hour?");
}

/**
 * Every row on every page. Throws rather than returning a partial list,
 * because the Sheet renders from the full set and a short list would blank
 * real reports.
 */
async function scrapeAllPages() {
  const all = [], seen = new Set();
  for (let n = 1; n <= MAX_PAGES; n++) {
    const { headerOk, rows } = await page.evaluate(extractLineRows);
    if (!headerOk && rows.length) throw new Error('the dashboard has no "Last Reported" column — LBJ changed its layout');
    const fresh = rows.filter((r) => !seen.has(r.title));
    if (rows.length && !fresh.length) return { rows: all, pages: n - 1 }; // wrapped around
    for (const r of fresh) { seen.add(r.title); all.push(r); }
    const pager = await page.evaluate(linePagerState);
    if (pager.next !== "enabled" || rows.length < PAGE_SIZE) return { rows: all, pages: n };
    await page.getByRole("button", { name: "Next", exact: true }).click();
    try {
      await page.waitForFunction((prev) => {
        const first = document.querySelector("table.dashboard-table tbody tr[title]");
        return !first || first.getAttribute("title") !== prev;
      }, pager.firstTitle, { timeout: 15000, polling: 250 });
    } catch {
      throw new Error(`page ${n + 1} never loaded after clicking Next — skipping this push`);
    }
  }
  throw new Error(`more than ${MAX_PAGES} pages — refusing to trust the pager`);
}

async function tick(cfg) {
  if (args.pick) await pickPage(); else await loadDashboard(cfg);
  const scrapedAt = new Date();
  const filter = await page.evaluate(lineDateFilter);
  const reportDate = parseFilterDate(filter);
  if (!reportDate) throw new Error(`cannot read the dashboard's date filter ("${filter}")`);
  const today = todayIn(cfg.timezone);
  if (reportDate !== today && !args.pick) alert("date", `LBJ's line dashboard is filtered to ${reportDate}, not today (${today}). Fix the Date filter in the browser window.`);

  const { rows, pages } = await scrapeAllPages();
  const { payload, noReport } = buildPayload({ rows, reportDate, scrapedAt });
  log(`scraped ${rows.length} location(s) over ${pages} page(s): ${payload.rows.length} with a report, ${noReport} without`);
  if (args.dryRun) {
    for (const r of payload.rows.slice(0, 8)) log(`  ${r.title}: ${r.wait} @ ${r.time}`);
    if (payload.rows.length > 8) log(`  … and ${payload.rows.length - 8} more`);
    log("[dry run] nothing sent to the Sheet");
    return;
  }
  const out = await sheet.lines(payload);
  log(`Sheet updated: ${out.rows} rows, ${out.matched} with a report` + (out.snapshots?.length ? `, snapshot(s): ${out.snapshots.join(", ")}` : ""));
  if (out.unmatched?.length) alert("unmatched", `${out.unmatched.length} LBJ location(s) match nothing on the locations tab — add them to the Aliases tab: ${out.unmatched.join("; ")}`);
  if (out.unknownWaits?.length) alert("waits", `unfamiliar wait value(s) on the dashboard: ${out.unknownWaits.join(", ")}`);
}

/** Wait until just past the next clock boundary (:00, :05, …), so a scrape lands right after each snapshot time. */
function msToNextBoundary(everyMin) {
  const ms = everyMin * 60000;
  return ms - (Date.now() % ms) + 5000;
}

let cfg = { everyMin: 5, timezone: "America/New_York", electionDate: "", lbjElectionName: "" };
log(`line scraper up — ${dashUrl}${args.dryRun ? " [DRY RUN]" : ""}`);
for (;;) {
  try {
    if (!args.dryRun) cfg = sheetConfig(await sheet.config());
    await tick(cfg);
  } catch (e) {
    alert("tick", `scrape failed: ${e.message}`);
    if (!args.dryRun) await sheet.heartbeat(`scrape failed: ${e.message}`).catch(() => {});
  }
  if (args.once) break;
  await page.waitForTimeout(msToNextBoundary(cfg.everyMin));
}
closing = true;
await context.close();
releaseLock(LOCK);
