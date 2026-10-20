/**
 * `npm run setup` — a guided first-time setup. Asks for the Sheet's web app
 * URL and token, the Votebuilder logins, writes .env, installs Chromium, and
 * checks that the Sheet answers. Safe to run again; existing values are the
 * defaults.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { ACCOUNTS, loadSync } from "../src/config.mjs";
import { SheetClient } from "../src/sheet.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = path.join(ROOT, ".env");

/** KEY=value lines → {KEY: value}. Good enough for the .env this script writes. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function renderEnv(values) {
  return [
    "# Written by `npm run setup`. Keep this file private; it is git-ignored.",
    "",
    "# URL: Apps Script editor → Deploy → Manage deployments. Token: Report Sync → Advanced → Show runner access",
    `SYNC_URL=${values.SYNC_URL ?? ""}`,
    `SYNC_TOKEN=${values.SYNC_TOKEN ?? ""}`,
    "",
    "# Votebuilder logins. Leave a pair blank to skip that database.",
    `VB_CAMPAIGN_EMAIL=${values.VB_CAMPAIGN_EMAIL ?? ""}`,
    `VB_CAMPAIGN_PASSWORD=${values.VB_CAMPAIGN_PASSWORD ?? ""}`,
    `VB_VOTERS_EMAIL=${values.VB_VOTERS_EMAIL ?? ""}`,
    `VB_VOTERS_PASSWORD=${values.VB_VOTERS_PASSWORD ?? ""}`,
    ""
  ].join("\n");
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const current = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, "utf8")) : {};
  const ask = async (label, key, { secret = false } = {}) => {
    const had = current[key] ? (secret ? " [keep current]" : ` [${current[key]}]`) : "";
    const answer = (await rl.question(`${label}${had}: `)).trim();
    return answer || current[key] || "";
  };

  console.log("\nVotebuilder Report Sync — runner setup\n");
  console.log("Step 1 of 3: the Sheet. Web app URL: Extensions → Apps Script → Deploy → Manage deployments. Token: Report Sync → Advanced → Show runner access.\n");
  const values = {};
  values.SYNC_URL = await ask("Web app URL", "SYNC_URL");
  values.SYNC_TOKEN = await ask("Sync token", "SYNC_TOKEN", { secret: true });

  console.log("\nStep 2 of 3: Votebuilder logins. A dedicated account is best; two-step sign-in is fine, you enter the code once during `npm run check` (see docs/security.md).\n");
  for (const [name, acct] of Object.entries(ACCOUNTS)) {
    console.log(`${acct.database} (press Enter to skip)`);
    values[acct.emailVar] = await ask("  email", acct.emailVar);
    values[acct.passwordVar] = values[acct.emailVar] ? await ask("  password", acct.passwordVar, { secret: true }) : "";
    if (!values[acct.emailVar]) console.log(`  skipping ${name}`);
  }
  rl.close();

  fs.writeFileSync(ENV_PATH, renderEnv(values), { mode: 0o600 });
  console.log(`\nSaved ${path.relative(process.cwd(), ENV_PATH) || ".env"}.`);

  console.log("\nStep 3 of 3: checks.\n");
  try {
    const name = await new SheetClient(loadSync({ SYNC_URL: values.SYNC_URL, SYNC_TOKEN: values.SYNC_TOKEN })).ping();
    console.log(`✓ The Sheet answers: "${name}"`);
  } catch (err) {
    console.log(`✗ ${err.message}`);
  }

  console.log("Installing the browser the runner drives (one-time, ~150 MB)…");
  try {
    execSync("npx playwright install chromium", { cwd: ROOT, stdio: "inherit" });
    console.log("✓ Browser installed");
  } catch {
    console.log("✗ Browser install failed. Run `npx playwright install chromium` and look at the error.");
  }

  const accounts = Object.entries(ACCOUNTS).filter(([, a]) => values[a.emailVar]).map(([n]) => n);
  console.log(`
Next:
  1. Watch one pass to confirm the login and reports work:
       npm start -- --account ${accounts[0] ?? "campaign"} --once --headed
  2. Keep it running in the background, even after a restart:
       npm run service -- install${accounts.length > 1 ? ` ${accounts.join(" ")}` : ""}
`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
