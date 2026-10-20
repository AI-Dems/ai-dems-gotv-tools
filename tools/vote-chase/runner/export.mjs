/**
 * Export the four Vote Chase Quick Counts crosstabs from Votebuilder and save
 * them as returned.xls, returned_regulars.xls, registered.xls and
 * registered_regulars.xls in one folder, then writes data.js for the page. Forked from
 * votebuilder-report-sync: the sign-in, pacing, browser profile, run lock,
 * download wait and logging come from the original AI Dems export tool (votebuilder-report-sync); the navigation (saved search →
 * Counts → Quick Counts) and the destination (a folder, not Google Sheets) are new.
 * Runs in the foreground; Ctrl-C or `npm stop` ends it.
 *
 *   npm start -- --headed --only returned     # first run: watch one slot
 *   npm start -- --then-make-data             # all four, then write data.js
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { SLOTS, USAGE, inHours, makeDataOptions, parseConfig, parseSearches, slotFile } from "./src/config.mjs";
import { whatToDo } from "./src/advice.mjs";
import { MakeDataError, makeData } from "./src/makedata.mjs";
import { saveCounts } from "./src/exportfile.mjs";
import { WAIT, settle } from "./src/actions.mjs";
import { loadCredentials } from "./src/login.mjs";
import { lockHolder, releaseLock, takeLock } from "./src/runlock.mjs";
import {
  clickExport,
  downloadExport,
  dumpFailure,
  listExports,
  openQuickCounts,
  openSavedSearch,
  waitForNewExport, bandSumGap, myListCount, refreshResults, totalPeopleIn, whereItStopped } from "./src/votebuilder.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEEP_DAYS = 7;

const pad = (n) => String(n).padStart(2, "0");

/** Local time as "2026-10-09 10:31:05". */
function localStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---- Startup ----

let cfg;
try {
  cfg = parseConfig(process.argv.slice(2));
} catch (err) {
  console.error(`${err.message}\n\n${USAGE}`);
  process.exit(2);
}
if (cfg.help) {
  console.log(USAGE);
  process.exit(0);
}

const { account } = cfg;
const OUT_DIR = path.resolve(HERE, cfg.out);
const DIR = {
  profile: path.join(HERE, "profiles", account.name),
  logs: path.join(HERE, "logs"),
  failures: path.join(HERE, "failures", account.name)
};
const LOCK_PATH = path.join(DIR.logs, `${account.name}.lock`);
// Written when a run finds the sign-in expired or rejected; headless runs then stop at once
// instead of re-submitting the password (and triggering a one-time code) every morning.
const NEEDS_SIGNIN_PATH = path.join(DIR.logs, `${account.name}.needs-signin`);
const LAST_SUCCESS_PATH = path.join(DIR.logs, `${account.name}.last-success.txt`);

fs.mkdirSync(DIR.logs, { recursive: true });
const logFile = fs.createWriteStream(path.join(DIR.logs, `${account.name}.log`), { flags: "a" });
function log(msg) {
  const line = `[${localStamp()}] ${account.name}: ${msg}`;
  console.log(line);
  logFile.write(`${line}\n`);
}

const credentials = loadCredentials(account);
if (!credentials) {
  console.error(`Set ${account.emailVar} and ${account.passwordVar} in .env (see .env.example).`);
  process.exit(2);
}

const searchesPath = path.resolve(HERE, cfg.searchesFile);
let searches;
try {
  searches = parseSearches(JSON.parse(fs.readFileSync(searchesPath, "utf8")), cfg.slots);
} catch (err) {
  const missing = err.code === "ENOENT";
  console.error(
    missing
      ? `No ${path.relative(HERE, searchesPath)}. Copy searches.example.json to searches.json and put your four saved search names in it.`
      : `Cannot use ${path.relative(HERE, searchesPath)}: ${err.message}`
  );
  process.exit(2);
}

{
  const byName = {};
  for (const slot of cfg.slots) (byName[searches[slot].search] ??= []).push(slot);
  for (const [name, slots] of Object.entries(byName)) {
    if (slots.length > 1) log(`WARNING: slots ${slots.join(" and ")} both use the saved search "${name}", so their files will be identical`);
  }
}

const holder = lockHolder(LOCK_PATH);
if (holder) {
  console.error(`The ${account.name} export is already running (PID ${holder}). Stop it with \`npm stop -- ${account.name}\` first.`);
  process.exit(75);
}

if (!takeLock(LOCK_PATH)) {
  console.error(`The ${account.name} export is already running (another run took the lock first). Try again in a minute.`);
  process.exit(75);
}

if (fs.existsSync(NEEDS_SIGNIN_PATH) && !cfg.headed) {
  const why = fs.readFileSync(NEEDS_SIGNIN_PATH, "utf8").trim();
  log(`not starting: a previous run found that VoteBuilder needs a fresh sign-in (${why}).`);
  log(`  What to do: run once with the browser window visible and sign in: npm start -- --headed --only ${cfg.slots[0]} --then-make-data`);
  releaseLock(LOCK_PATH);
  process.exit(1);
}

// ---- Shutdown ----

let stopping = false;
let activeContext = null;
let wakeSleeper = null;

function onSignal(sig) {
  if (stopping) {
    log(`${sig} again; exiting now`);
    releaseLock(LOCK_PATH);
    process.exit(130);
  }
  stopping = true;
  log(`${sig} received; stopping${activeContext ? " after closing the browser" : ""}`);
  activeContext?.close().catch(() => {});
  wakeSleeper?.();
}
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

// ---- One pass ----

/** Export one slot's Quick Counts crosstab from Votebuilder into OUT_DIR. Returns {file, path, bytes}. */
async function exportOne(page, entry) {
  const opts = { credentials, database: account.database, log, headed: cfg.headed };
  // Note the exports already on My Export Files, so a queued export can be told apart from them.
  const known = (await listExports(page, opts)).map((e) => e.id).filter(Boolean);
  let listCount = await openSavedSearch(page, entry.search, opts);
  await openQuickCounts(page, entry, opts);
  let body;
  // VAN can hand back a crosstab whose band cells were still being computed: row totals right,
  // cells short. If the cells do not add up, refresh and export once more with a longer wait.
  for (let attempt = 1; ; attempt++) {
    const got = await clickExport(page, opts);
    body = got.body;
    if (got.kind === "queued") {
      log("  waiting for the export on My Export Files");
      const exp = await waitForNewExport(page, known, opts);
      log(`  downloading ${exp.file}`);
      body = await downloadExport(page, exp);
    }
    const gap = bandSumGap(body);
    if (!gap.rowsOff) break;
    const detail = `the score cells add up to ${gap.bands.toLocaleString()} people but the row totals say ${gap.totals.toLocaleString()} (${gap.rowsOff} precinct row(s) short)`;
    if (attempt >= 2) {
      throw new Error(`VoteBuilder's crosstab was incomplete twice: ${detail}. File not saved.`);
    }
    log(`  VoteBuilder's crosstab was incomplete (${detail}); refreshing and exporting again`);
    await refreshResults(page, opts, 15000);
  }
  // The export must be of the list that was just run, not of everyone in the committee.
  // Both numbers have to be readable: an export that cannot be checked is not saved.
  // The sidebar count is re-read here in case the search was still running when it was first read.
  const fresh = await myListCount(page).catch(() => null);
  if (fresh != null && fresh !== listCount) {
    log(`  My List now ${fresh.toLocaleString()} people (the search was still running when first read)`);
    listCount = fresh;
  }
  const total = totalPeopleIn(body);
  if (listCount == null) {
    throw new Error(`could not read the "My List (N People)" count from the VoteBuilder sidebar after running the search, so the export cannot be checked against it. File not saved.`);
  }
  if (total == null) {
    throw new Error(`the export has no "Total People" row, so it cannot be checked against the list (${listCount.toLocaleString()} people). It is probably not a Quick Counts crosstab. File not saved.`);
  }
  if (total !== listCount) {
    throw new Error(`the export counts ${total.toLocaleString()} people but the saved search has ${listCount.toLocaleString()}; the Counts page was counting "Registered Voters" (everyone), not "My List". File not saved.`);
  }
  log(`  export total ${total.toLocaleString()} people (matches the list)`);
  return saveCounts(body, slotFile(entry.slot), OUT_DIR);
}

/** Delete entries in `dir` older than KEEP_DAYS. */
function prune(dir) {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const p = path.join(dir, name);
    if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true });
  }
}

/** Turn the saved exports into data.js (in-process, no Python). Returns true on success. */
function runMakeData() {
  // Each slot's file is named explicitly (the newest-file-by-keyword folder mode is for
  // hand use; a stray "returned (1).xls" or a leftover .part must not win here).
  const files = {};
  for (const slot of SLOTS) {
    const p = path.join(OUT_DIR, slotFile(slot));
    if (fs.existsSync(p)) files[slot] = p;
  }
  const out = path.resolve(HERE, cfg.dataOut);
  log(`writing data.js → ${out}`);
  try {
    const res = makeData({ ...makeDataOptions(files), out, electionDay: cfg.electionDay });
    for (const w of res.warnings) log(`  make-data: ${w}`);
    log(`  make-data: ${res.summary}`);
    return true;
  } catch (err) {
    if (!(err instanceof MakeDataError)) throw err;
    log(`data.js was not written: ${err.message} (the exports themselves are saved in exports/)`);
    return false;
  }
}

async function runPass() {
  log(`pass starting: ${cfg.slots.length} slot(s) into ${OUT_DIR}`);

  // Hold off idle sleep for this process's lifetime; killed when the pass ends.
  let caffeinate = null;
  if (process.platform === "darwin") {
    caffeinate = spawn("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
    caffeinate.on("error", () => {});
  }

  const results = cfg.slots.map((slot) => ({ slot, ok: false }));
  const launch = async () => {
    activeContext = await chromium.launchPersistentContext(DIR.profile, {
      headless: !cfg.headed,
      acceptDownloads: true,
      viewport: { width: 1440, height: 1000 }
    });
    return activeContext.pages()[0] ?? (await activeContext.newPage());
  };
  // The browser itself can die mid-slot (Chrome for Testing has crashed on a download);
  // that is not a navigation problem, so relaunch and retry the slot once.
  const browserDied = (err) => /has been closed|Target closed|crashed|Target page, context or browser/i.test(err?.message || "");
  const isSignInProblem = (err, where) =>
    /sign-in page|has expired/i.test(where || "") || /ActionID|one-time code|login (form|did not)|rejected the login/i.test(err?.message || "");
  let signInFailed = false;
  try {
    let page = await launch();

    for (const [i, slot] of cfg.slots.entries()) {
      if (i > 0 && !stopping) await settle(page, WAIT.betweenReports).catch(() => {});
      if (stopping) break;
      log(`[${slot}] exporting saved search "${searches[slot].search}"`);
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const saved = await exportOne(page, searches[slot]);
          results[i].ok = true;
          // A saved export proves the sign-in works again.
          fs.rmSync(NEEDS_SIGNIN_PATH, { force: true });
          log(`[${slot}] saved ${path.relative(HERE, saved.path)} (${saved.bytes} bytes)`);
          break;
        } catch (err) {
          if (stopping) break;
          if (browserDied(err) && attempt === 1) {
            log(`[${slot}] the browser closed unexpectedly (${err.message.split("\n")[0]}); relaunching and retrying this slot once`);
            await activeContext?.close().catch(() => {});
            activeContext = null;
            await new Promise((r) => setTimeout(r, 3000));
            if (stopping) break;
            page = await launch();
            continue;
          }
          log(`[${slot}] FAILED: ${err.message}`);
          if (!browserDied(err)) {
            const where = await whereItStopped(page).catch(() => "");
            if (where) log(`  where it stopped: ${where}`);
            log(`  page: ${page.url()}`);
            const dumped = await dumpFailure(page, DIR.failures, slot).catch(() => ({ files: [], skipped: "" }));
            if (dumped.files.length) log(`  screenshot saved to ${dumped.files.map((p) => path.relative(HERE, p)).join(", ")}`);
            else if (dumped.skipped) log(`  no screenshot saved: ${dumped.skipped}`);
            log(`  What to do: ${whatToDo(err, where, slot)}`);
            if (isSignInProblem(err, where)) {
              // One attempt per run. Trying the other slots would submit the password again
              // each time, sending more one-time codes or, with a stale password, failing
              // sign-ins until ActionID blocks the account.
              fs.writeFileSync(NEEDS_SIGNIN_PATH, `${localStamp()} ${err.message.split("\n")[0]}\n`);
              signInFailed = true;
              log(`  the other slots were not tried; headless runs will stop at once until a --headed run signs in again`);
            }
          } else {
            log(`  What to do: ${whatToDo(err, "browser", slot)}`);
          }
          break;
        }
      }
      if (stopping || signInFailed) break;
    }
  } catch (err) {
    log(`browser problem: ${err.message}`);
  } finally {
    await activeContext?.close().catch(() => {});
    activeContext = null;
  }

  caffeinate?.kill();
  prune(DIR.failures);
  const ok = results.filter((r) => r.ok).length;
  log(`pass finished: ${ok}/${results.length} OK`);
  let allOk = ok === results.length;
  if (allOk && cfg.thenMakeData) allOk = runMakeData();
  if (allOk) fs.writeFileSync(LAST_SUCCESS_PATH, `${localStamp()} ${cfg.slots.join(" ")}${cfg.thenMakeData ? " + data.js" : ""}\n`);
  if (cfg.thenMakeData && ok !== results.length) {
    const failed = results.filter((r) => !r.ok).map((r) => r.slot);
    log(`data.js was NOT updated (${failed.join(", ")} failed); the page keeps showing the previous pull. The slots that passed are saved in exports/, so re-run only the failed one(s): npm start -- --headed --only ${failed.join(" --only ")} --then-make-data`);
  }
  return allOk;
}

// ---- Schedule ----

/** Sleep until `ms` from now, or until a stop signal. */
function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    wakeSleeper = () => {
      clearTimeout(t);
      resolve();
    };
  });
}

const hoursLabel = `${cfg.hours.start}:00–${cfg.hours.end}:00`;
log(
  cfg.once
    ? `one pass over ${cfg.slots.length} slot(s) in ${account.database}`
    : `exporting ${cfg.slots.length} slot(s) from ${account.database} every ${cfg.everyMin} min, ${hoursLabel}. Ctrl-C or \`npm stop -- ${account.name}\` to end.`
);
for (const slot of cfg.slots) log(`  ${slot} ← saved search "${searches[slot].search}" → ${slotFile(slot)}`);

let allOk = true;
let idleLogged = false;
try {
  const everyMs = (cfg.everyMin ?? 0) * 60000;
  for (let next = Date.now(); !stopping; ) {
    if (cfg.once || inHours(new Date(), cfg.hours)) {
      idleLogged = false;
      allOk = await runPass();
    } else if (!idleLogged) {
      log(`outside ${hoursLabel}; waiting`);
      idleLogged = true;
    }
    if (cfg.once) break;

    // Next slot on the original grid, on the exact minute; a pass that overran skips the slots it covered.
    while (next <= Date.now()) next += everyMs;
    const startAt = next;
    if (!idleLogged) log(`next pass at ${localStamp(new Date(startAt)).slice(11, 19)}`);
    await sleep(startAt - Date.now());
  }
} catch (err) {
  log(`!!! export stopped on an unexpected error: ${err.stack || err.message}`);
  allOk = false;
} finally {
  releaseLock(LOCK_PATH);
  log("stopped");
  logFile.end();
}
process.exitCode = allOk ? 0 : 1;
