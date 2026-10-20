/**
 * `npm run service -- install` runs `export:all` every morning without anyone
 * opening a terminal. `uninstall` removes it; `status` says what is installed.
 *
 *   macOS    a launchd agent in ~/Library/LaunchAgents (a missed time runs on wake)
 *   Windows  a daily Task Scheduler task
 *   Linux    not automated; docs/automation.md has a systemd timer to copy
 *
 * Options after the command:
 *   --at HH:MM            local time, default 06:30
 *   --data-out <path>     where data.js goes (default ../data.js, next to index.html)
 *   --account <name>      voters (default) or campaign
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ACCOUNTS } from "../src/config.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = (account) => `com.aidems.vote-chase.${account}`;

export function parseServiceArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { at: { type: "string", default: "06:30" }, "data-out": { type: "string" }, account: { type: "string", default: "voters" } }
  });
  const command = positionals[0] ?? "status";
  const m = /^(\d{1,2}):(\d{2})$/.exec(values.at);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`--at must be HH:MM, got "${values.at}"`);
  const account = values.account.toLowerCase();
  if (!Object.hasOwn(ACCOUNTS, account)) throw new Error(`Unknown account "${account}". Accounts: ${Object.keys(ACCOUNTS).join(", ")}`);
  if (!["install", "uninstall", "status"].includes(command)) throw new Error("Usage: npm run service -- <install|uninstall|status> [--at HH:MM] [--data-out path] [--account voters]");
  return { command, hour: Number(m[1]), minute: Number(m[2]), dataOut: values["data-out"] ? path.resolve(values["data-out"]) : null, account };
}

/** The node arguments the scheduled job runs. */
export function jobArgs({ account, dataOut }) {
  const args = ["--env-file-if-exists=.env", "export.mjs", "--then-make-data", "--account", account];
  if (dataOut) args.push("--data-out", dataOut);
  return args;
}

const xmlEscape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- macOS ----

const launchd = {};
launchd.plist = (o) => path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL(o.account)}.plist`);
launchd.install = (o) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL(o.account)}</string>
  <key>ProgramArguments</key><array>
    <string>${xmlEscape(process.execPath)}</string>
${jobArgs(o).map((a) => `    <string>${xmlEscape(a)}</string>`).join("\n")}
  </array>
  <key>WorkingDirectory</key><string>${xmlEscape(ROOT)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xmlEscape(process.env.PATH)}</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>${o.hour}</integer><key>Minute</key><integer>${o.minute}</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>${xmlEscape(path.join(ROOT, "logs", `${o.account}.service.log`))}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(path.join(ROOT, "logs", `${o.account}.service.log`))}</string>
</dict></plist>
`;
  fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
  fs.mkdirSync(path.dirname(launchd.plist(o)), { recursive: true });
  launchd.uninstall(o, true);
  fs.writeFileSync(launchd.plist(o), xml);
  execFileSync("launchctl", ["bootstrap", `gui/${process.getuid()}`, launchd.plist(o)], { stdio: "inherit" });
  console.log(`Installed ${LABEL(o.account)}: runs every day at ${pad(o.hour)}:${pad(o.minute)} (or when the Mac next wakes, if it was asleep). Log: logs/${o.account}.log`);
};
launchd.uninstall = (o, quiet = false) => {
  const plist = launchd.plist(o);
  if (!fs.existsSync(plist)) { if (!quiet) console.log(`${LABEL(o.account)} is not installed.`); return; }
  try { execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, plist], { stdio: "ignore" }); } catch { /* was not loaded */ }
  fs.unlinkSync(plist);
  if (!quiet) console.log(`Removed ${LABEL(o.account)}.`);
};
launchd.status = (o) => {
  let state = "not installed";
  if (fs.existsSync(launchd.plist(o))) {
    try {
      execFileSync("launchctl", ["print", `gui/${process.getuid()}/${LABEL(o.account)}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      state = "installed (runs on its daily schedule)";
    } catch { state = "installed, not loaded (log out and in, or run install again)"; }
  }
  console.log(`${o.account}: ${state}${lastSuccess(o.account)}`);
};

// ---- Windows ----

const scheduler = {};
scheduler.name = (o) => `VoteChase-${o.account}`;
scheduler.install = (o) => {
  const q = (s) => `""${s}""`;
  const cmd = `cmd /c "cd /d ${q(ROOT)} && ${q(process.execPath)} ${jobArgs(o).map((a) => (a.includes(" ") ? q(a) : a)).join(" ")} >> logs\\${o.account}.service.log 2>&1"`;
  fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
  execSync(`schtasks /Create /F /SC DAILY /ST ${pad(o.hour)}:${pad(o.minute)} /TN "${scheduler.name(o)}" /TR "${cmd.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
  console.log(`Installed task ${scheduler.name(o)}: runs every day at ${pad(o.hour)}:${pad(o.minute)} while you are logged in. Log: logs\\${o.account}.log`);
};
scheduler.uninstall = (o) => {
  try {
    execSync(`schtasks /Delete /F /TN "${scheduler.name(o)}"`, { stdio: "ignore" });
    console.log(`Removed task ${scheduler.name(o)}.`);
  } catch { console.log(`${scheduler.name(o)} is not installed.`); }
};
scheduler.status = (o) => {
  try {
    const out = execSync(`schtasks /Query /TN "${scheduler.name(o)}" /FO LIST`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    console.log(`${o.account}: ${/Status:\s*(.+)/.exec(out)?.[1]?.trim() ?? "installed"}${lastSuccess(o.account)}`);
  } catch { console.log(`${o.account}: not installed`); }
};

// ---- Shared ----

const pad = (n) => String(n).padStart(2, "0");
function lastSuccess(account) {
  const p = path.join(ROOT, "logs", `${account}.last-success.txt`);
  const marker = path.join(ROOT, "logs", `${account}.needs-signin`);
  let s = fs.existsSync(p) ? `. Last successful run: ${fs.readFileSync(p, "utf8").trim().slice(0, 19)}` : ". No successful run recorded yet";
  if (fs.existsSync(marker)) s += ". NEEDS SIGN-IN: run npm run check and sign in before the next scheduled run";
  return s;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let o;
  try { o = parseServiceArgs(process.argv.slice(2)); } catch (err) { console.error(err.message); process.exit(2); }
  const impl = { darwin: launchd, win32: scheduler }[process.platform];
  if (!impl) { console.log("Background install is automated on macOS and Windows only. See docs/automation.md for Linux."); process.exit(0); }
  impl[o.command](o);
}
