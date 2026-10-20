/**
 * `npm run setup` — guided first-time setup. Asks for the Sheet's web app URL
 * and token and where LBJ lives, writes .env, installs Chromium, and checks
 * that the Sheet answers. Safe to run again; existing values are the defaults.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/config.mjs";
import { SheetClient } from "../src/sheet.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = path.join(ROOT, ".env");

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function renderEnv(v) {
  return [
    "# Written by `npm run setup`. Keep this file private; it is git-ignored.",
    "",
    "# From the Sheet: Polling Priority → Show runner access",
    `SHEET_URL=${v.SHEET_URL ?? ""}`,
    `SHEET_TOKEN=${v.SHEET_TOKEN ?? ""}`,
    "",
    "# Where LBJ lives",
    `LBJ_URL=${v.LBJ_URL || "https://lbj.voting"}`,
    ""
  ].join("\n");
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const current = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, "utf8")) : {};
  const ask = async (label, key, { secret = false, fallback = "" } = {}) => {
    const cur = current[key] || fallback;
    const had = cur ? (secret ? " [keep current]" : ` [${cur}]`) : "";
    return (await rl.question(`${label}${had}: `)).trim() || cur;
  };

  console.log("\nPolling Location Priority — line scraper setup\n");
  console.log("Step 1 of 3: the Sheet. In your copy of the template, open Polling Priority → Show runner access.\n");
  const values = {};
  values.SHEET_URL = await ask("Web app URL", "SHEET_URL");
  values.SHEET_TOKEN = await ask("Token", "SHEET_TOKEN", { secret: true });
  console.log("\nStep 2 of 3: LBJ.\n");
  values.LBJ_URL = await ask("LBJ address", "LBJ_URL", { fallback: "https://lbj.voting" });
  rl.close();

  fs.writeFileSync(ENV_PATH, renderEnv(values), { mode: 0o600 });
  console.log(`\nSaved .env.`);

  console.log("\nStep 3 of 3: checks.\n");
  try {
    const name = await new SheetClient(loadEnv(values)).ping();
    console.log(`✓ The Sheet answers: "${name}"`);
  } catch (err) {
    console.log(`✗ ${err.message}`);
  }
  console.log("Installing the browser the scraper drives (one-time, ~150 MB)…");
  try {
    execSync("npx playwright install chromium", { cwd: ROOT, stdio: "inherit" });
    console.log("✓ Browser installed");
  } catch {
    console.log("✗ Browser install failed. Run `npx playwright install chromium` and look at the error.");
  }
  console.log(`
Next:
  1. npm run check      opens LBJ in a window; sign in there once. Prints what it would send, sends nothing.
  2. npm run once       one real push. Look at the Sheet's Line Reports tab.
  3. On election day:   npm start    (or install it as a background service: npm run service -- install)
`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
