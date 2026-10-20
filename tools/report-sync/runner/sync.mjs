/**
 * Every N minutes during active hours, export each report listed on the
 * Sheet's Setup tab from Votebuilder and send it to the Sheet. Each --account
 * runs as its own process with its own browser profile, lock and log file.
 *
 *   npm start -- --account campaign
 *   npm start -- --account voters --once --headed
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { USAGE, inHours, loadSync, parseArgv, sheetConfig } from "./src/config.mjs";
import { extractExport, readExport } from "./src/exportfile.mjs";
import { loadCredentials } from "./src/login.mjs";
import { lockHolder, releaseLock, takeLock } from "./src/runlock.mjs";
import { SheetClient } from "./src/sheet.mjs";
import { downloadExport, dumpFailure, exportReport, listExports, resolveReport, waitForNewExport } from "./src/votebuilder.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEEP_DAYS = 1; // exports hold voter data; keep them only long enough to debug a failure
const IDLE_RECHECK_MIN = 5; // how often to re-read Setup while outside active hours or with nothing to do

const pad = (n) => String(n).padStart(2, "0");

/** Local time as "2026-10-09 10:31:05". */
function localStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---- Startup ----

let args;
try {
  args = parseArgv(process.argv.slice(2));
} catch (err) {
  console.error(`${err.message}\n\n${USAGE}`);
  process.exit(2);
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const { account } = args;
const DIR = {
  profile: path.join(HERE, "profiles", account.name),
  logs: path.join(HERE, "logs"),
  failures: path.join(HERE, "failures", account.name),
  downloads: path.join(HERE, "downloads", account.name)
};
const LOCK_PATH = path.join(DIR.logs, `${account.name}.lock`);

fs.mkdirSync(DIR.logs, { recursive: true });
const logFile = fs.createWriteStream(path.join(DIR.logs, `${account.name}.log`), { flags: "a" });
function log(msg) {
  const line = `[${localStamp()}] ${account.name}: ${msg}`;
  console.log(line);
  logFile.write(`${line}\n`);
}

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

const credentials = loadCredentials(account);
if (!credentials) fail(`Set ${account.emailVar} and ${account.passwordVar} in .env for the ${account.name} account, or run \`npm run setup\`.`);

let sheet;
try {
  sheet = new SheetClient(loadSync());
} catch (err) {
  fail(err.message);
}

const holder = lockHolder(LOCK_PATH);
if (holder) fail(`The ${account.name} sync is already running (PID ${holder}). Stop it with \`npm stop -- ${account.name}\` first.`);

let cfg;
try {
  cfg = sheetConfig(await sheet.config(), account.database);
} catch (err) {
  fail(`Cannot read the Sheet's Setup tab: ${err.message}`);
}

takeLock(LOCK_PATH);

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

/** Export one report from Votebuilder into `dir`. Returns {file, path}. */
async function exportOne(page, report, dir) {
  const opts = { credentials, database: account.database, log, headed: args.headed };
  const known = (await listExports(page, opts)).map((e) => e.id).filter(Boolean);
  const url = await resolveReport(page, report.name, opts);
  await exportReport(page, url, cfg.format, opts);
  log(`  export started; waiting for it on My Export Files`);
  const exp = await waitForNewExport(page, known, opts);
  log(`  downloading ${exp.file} (${exp.records || "?"} records)`);
  return extractExport(await downloadExport(page, exp), cfg.format, dir);
}

/** Delete entries in `dir` older than KEEP_DAYS. */
function prune(dir) {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const p = path.join(dir, name);
    if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true });
  }
}

/** On a Mac, hold off idle sleep while this process lives. Elsewhere, a no-op. */
function stayAwake() {
  if (process.platform !== "darwin") return { kill() {} };
  const p = spawn("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
  p.on("error", () => {});
  return p;
}

async function runPass() {
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(DIR.downloads, runStamp);
  log(`pass starting: ${cfg.reports.length} report(s)`);
  const awake = stayAwake();

  const results = cfg.reports.map((r) => ({ report: r.name, database: account.database, tab: r.tab, status: "Error" }));
  try {
    activeContext = await chromium.launchPersistentContext(DIR.profile, {
      headless: !args.headed,
      acceptDownloads: true,
      viewport: { width: 1440, height: 1000 }
    });
    const page = activeContext.pages()[0] ?? (await activeContext.newPage());

    for (const [i, report] of cfg.reports.entries()) {
      if (stopping) break;
      log(`[${report.name}] exporting`);
      try {
        const saved = await exportOne(page, report, dir);
        Object.assign(results[i], { file: saved.file, path: saved.path });
        log(`[${report.name}] saved ${path.relative(HERE, saved.path)}`);
      } catch (err) {
        if (stopping) {
          results[i].details = "stopped before the export finished";
          break;
        }
        results[i].details = err.message;
        log(`[${report.name}] FAILED: ${err.message}`);
        const dumped = await dumpFailure(page, DIR.failures, `report${i + 1}`);
        if (dumped.length) log(`  page saved to ${dumped.map((p) => path.relative(HERE, p)).join(", ")}`);
      }
    }
  } catch (err) {
    for (const r of results) r.details ??= `browser problem: ${err.message}`;
    log(`browser problem: ${err.message}`);
  } finally {
    await activeContext?.close().catch(() => {});
    activeContext = null;
  }
  for (const r of results) if (!r.path) r.details ??= "stopped before export";

  // Upload whatever downloaded, even if the run is stopping, so a finished export is not wasted.
  for (const r of results) {
    if (!r.path) continue;
    try {
      const rows = readExport(r.path, cfg.format);
      await sheet.replace({ tab: r.tab, rows, report: r.report, database: r.database, file: r.file });
      Object.assign(r, { rows: rows.length, status: "OK", details: "" });
      log(`[${r.report}] replaced tab "${r.tab}" with ${rows.length} rows`);
    } catch (err) {
      r.details = `upload failed: ${err.message}`;
      log(`[${r.report}] upload FAILED: ${err.message}`);
    }
  }

  const failed = results.filter((r) => r.status !== "OK");
  const ok = results.length - failed.length;
  const summary = `${ok}/${results.length} OK (${account.database})`;
  try {
    if (failed.length) await sheet.log(failed.map((r) => ({ ...r, timestamp: localStamp(), path: undefined })));
    await sheet.heartbeat(summary);
  } catch (err) {
    log(`!!! could not write to the Sheet: ${err.message}`);
  }

  awake.kill();
  prune(DIR.downloads);
  prune(DIR.failures);
  log(`pass finished: ${summary}`);
  return ok === results.length;
}

// ---- Schedule ----

/** Sleep until `ms` from now, or until a stop signal. */
function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, Math.max(0, ms));
    wakeSleeper = () => {
      clearTimeout(t);
      resolve();
    };
  });
}

/** Re-read Setup. Keeps the last good config when the Sheet is unreachable. */
async function refreshConfig() {
  try {
    const next = sheetConfig(await sheet.config(), account.database);
    const changed = JSON.stringify(next) !== JSON.stringify(cfg);
    cfg = next;
    if (changed) describe();
  } catch (err) {
    log(`could not re-read Setup, keeping the last config: ${err.message}`);
  }
}

function describe() {
  const hours = `${cfg.hours.start}:00–${cfg.hours.end}:00 ${cfg.timezone}`;
  log(`${cfg.reports.length} report(s) from ${account.database}, every ${cfg.everyMin} min, ${hours}`);
  for (const r of cfg.reports) log(`  "${r.name}" → tab "${r.tab}"`);
}

describe();
if (!args.once) log(`Ctrl-C or \`npm stop -- ${account.name}\` to end.`);

let allOk = true;
let idle = null; // why we are waiting, logged once per stretch
try {
  for (let next = Date.now(); !stopping; ) {
    const active = args.once || inHours(new Date(), cfg.hours, cfg.timezone);
    const reason = !cfg.reports.length ? "no enabled reports on Setup for this database" : !active ? "outside active hours" : null;
    if (!reason) {
      idle = null;
      allOk = await runPass();
    } else {
      if (reason !== idle) log(`${reason}; waiting`);
      idle = reason;
      await sheet.heartbeat().catch(() => {}); // keep "Runner last seen" current while idle
    }
    if (args.once) break;

    // Next slot on the original grid; a pass that overran skips the slots it covered.
    const everyMs = (idle ? IDLE_RECHECK_MIN : cfg.everyMin) * 60000;
    while (next <= Date.now()) next += everyMs;
    const startAt = next;
    if (!idle) log(`next pass at ${localStamp(new Date(startAt)).slice(11, 19)}`);
    await sleep(startAt - Date.now());
    if (!stopping) await refreshConfig();
  }
} catch (err) {
  log(`!!! sync stopped on an unexpected error: ${err.stack || err.message}`);
  allOk = false;
} finally {
  releaseLock(LOCK_PATH);
  log("stopped");
  logFile.end();
}
process.exitCode = allOk ? 0 : 1;
