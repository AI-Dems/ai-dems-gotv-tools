/**
 * `npm run service -- install` keeps the scraper going in the background and
 * brings it back after a crash. `uninstall` removes it; `status` says what is
 * installed. The scraper is headed (you log into LBJ in its window), so the
 * service runs in your login session.
 *
 *   macOS    a launchd agent in ~/Library/LaunchAgents
 *   Windows  a Task Scheduler task that starts at logon
 *   Linux    not automated; docs/setup.md has a systemd unit to copy
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "com.aidems.polling-priority";
const LOG = path.join(ROOT, "logs", "service.log");

const launchd = {
  plist: path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`),
  install() {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${process.execPath}</string>
    <string>--env-file-if-exists=.env</string>
    <string>lines.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${process.env.PATH}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
</dict></plist>
`;
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.mkdirSync(path.dirname(this.plist), { recursive: true });
    this.uninstall(true);
    fs.writeFileSync(this.plist, xml);
    execFileSync("launchctl", ["bootstrap", `gui/${process.getuid()}`, this.plist], { stdio: "inherit" });
    console.log(`Installed ${LABEL}. It is running now and will start at every login. Log: logs/service.log`);
  },
  uninstall(quiet = false) {
    if (!fs.existsSync(this.plist)) { if (!quiet) console.log(`${LABEL} is not installed.`); return; }
    try { execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, this.plist], { stdio: "ignore" }); } catch { /* not loaded */ }
    fs.unlinkSync(this.plist);
    if (!quiet) console.log(`Removed ${LABEL}.`);
  },
  status() {
    let state = "not installed";
    if (fs.existsSync(this.plist)) {
      try {
        const out = execFileSync("launchctl", ["print", `gui/${process.getuid()}/${LABEL}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        state = /state = running/.test(out) ? "running" : "installed, not running";
      } catch { state = "installed, not loaded"; }
    }
    console.log(state);
  }
};

const scheduler = {
  name: "PollingPriority-LineScraper",
  install() {
    const cmd = `cmd /c "cd /d ""${ROOT}"" && ""${process.execPath}"" --env-file-if-exists=.env lines.mjs >> logs\\service.log 2>&1"`;
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    execSync(`schtasks /Create /F /SC ONLOGON /TN "${this.name}" /TR "${cmd.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
    execSync(`schtasks /Run /TN "${this.name}"`, { stdio: "inherit" });
    console.log(`Installed task ${this.name}. It is running now and will start at every logon. Log: logs\\service.log`);
  },
  uninstall() {
    try {
      execSync(`schtasks /End /TN "${this.name}"`, { stdio: "ignore" });
      execSync(`schtasks /Delete /F /TN "${this.name}"`, { stdio: "ignore" });
      console.log(`Removed task ${this.name}.`);
    } catch { console.log(`${this.name} is not installed.`); }
  },
  status() {
    try {
      const out = execSync(`schtasks /Query /TN "${this.name}" /FO LIST`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      console.log(/Status:\s*(.+)/.exec(out)?.[1]?.trim() ?? "installed");
    } catch { console.log("not installed"); }
  }
};

const [command = "status"] = process.argv.slice(2);
const impl = { darwin: launchd, win32: scheduler }[process.platform];
if (!impl) { console.log("Background install is automated on macOS and Windows only. See docs/setup.md for Linux."); process.exit(0); }
if (!["install", "uninstall", "status"].includes(command)) { console.error("Usage: npm run service -- <install|uninstall|status>"); process.exit(2); }
impl[command]();
