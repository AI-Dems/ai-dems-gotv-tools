/**
 * `npm run service -- install [campaign] [voters]` keeps the runner going in
 * the background and brings it back after a restart or crash. `uninstall`
 * removes it; `status` says what is installed.
 *
 *   macOS    a launchd agent per account in ~/Library/LaunchAgents
 *   Windows  a Task Scheduler task per account that starts at logon
 *   Linux    not automated; docs/setup.md has a systemd unit to copy
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCOUNTS } from "../src/config.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = (account) => `com.aidems.report-sync.${account}`;

// ---- macOS ----

const launchd = {};
launchd.plist = (account) => path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL(account)}.plist`);
launchd.install = (account) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL(account)}</string>
  <key>ProgramArguments</key><array>
    <string>${process.execPath}</string>
    <string>--env-file-if-exists=.env</string>
    <string>sync.mjs</string>
    <string>--account</string><string>${account}</string>
  </array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${process.env.PATH}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>${path.join(ROOT, "logs", `${account}.service.log`)}</string>
  <key>StandardErrorPath</key><string>${path.join(ROOT, "logs", `${account}.service.log`)}</string>
</dict></plist>
`;
  fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
  fs.mkdirSync(path.dirname(launchd.plist(account)), { recursive: true });
  launchd.uninstall(account, true);
  fs.writeFileSync(launchd.plist(account), xml);
  execFileSync("launchctl", ["bootstrap", `gui/${process.getuid()}`, launchd.plist(account)], { stdio: "inherit" });
  console.log(`Installed ${LABEL(account)}. It is running now and will start at every login. Log: logs/${account}.log`);
};
launchd.uninstall = (account, quiet = false) => {
  const plist = launchd.plist(account);
  if (!fs.existsSync(plist)) {
    if (!quiet) console.log(`${LABEL(account)} is not installed.`);
    return;
  }
  try {
    execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, plist], { stdio: "ignore" });
  } catch { /* was not loaded */ }
  fs.unlinkSync(plist);
  if (!quiet) console.log(`Removed ${LABEL(account)}.`);
};
launchd.status = (account) => {
  let state = "not installed";
  if (fs.existsSync(launchd.plist(account))) {
    try {
      const out = execFileSync("launchctl", ["print", `gui/${process.getuid()}/${LABEL(account)}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      state = /state = running/.test(out) ? "running" : "installed, not running";
    } catch {
      state = "installed, not loaded";
    }
  }
  console.log(`${account}: ${state}`);
};

// ---- Windows ----

const scheduler = {};
scheduler.name = (account) => `ReportSync-${account}`;
scheduler.install = (account) => {
  const cmd = `cmd /c "cd /d ""${ROOT}"" && ""${process.execPath}"" --env-file-if-exists=.env sync.mjs --account ${account} >> logs\\${account}.service.log 2>&1"`;
  fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
  execSync(`schtasks /Create /F /SC ONLOGON /TN "${scheduler.name(account)}" /TR "${cmd.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
  execSync(`schtasks /Run /TN "${scheduler.name(account)}"`, { stdio: "inherit" });
  console.log(`Installed task ${scheduler.name(account)}. It is running now and will start at every logon. Log: logs\\${account}.log`);
};
scheduler.uninstall = (account) => {
  try {
    execSync(`schtasks /End /TN "${scheduler.name(account)}"`, { stdio: "ignore" });
    execSync(`schtasks /Delete /F /TN "${scheduler.name(account)}"`, { stdio: "ignore" });
    console.log(`Removed task ${scheduler.name(account)}.`);
  } catch {
    console.log(`${scheduler.name(account)} is not installed.`);
  }
};
scheduler.status = (account) => {
  try {
    const out = execSync(`schtasks /Query /TN "${scheduler.name(account)}" /FO LIST`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    console.log(`${account}: ${/Status:\s*(.+)/.exec(out)?.[1]?.trim() ?? "installed"}`);
  } catch {
    console.log(`${account}: not installed`);
  }
};

// ---- Dispatch ----

const [command = "status", ...named] = process.argv.slice(2);
const accounts = named.length ? named.map((a) => a.toLowerCase()) : ["campaign"];
const unknown = accounts.filter((a) => !Object.hasOwn(ACCOUNTS, a));
if (unknown.length) {
  console.error(`Unknown account ${unknown.join(", ")}. Accounts: ${Object.keys(ACCOUNTS).join(", ")}`);
  process.exit(2);
}

const impl = { darwin: launchd, win32: scheduler }[process.platform];
if (!impl) {
  console.log("Background install is automated on macOS and Windows only. See docs/setup.md for Linux.");
  process.exit(0);
}
if (!["install", "uninstall", "status"].includes(command)) {
  console.error("Usage: npm run service -- <install|uninstall|status> [campaign] [voters]");
  process.exit(2);
}
for (const account of accounts) impl[command](account);
