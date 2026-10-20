/**
 * `npm run setup` — a guided first-time setup. Asks for the VoteBuilder login, the
 * score to crosstab by and the four saved search names, writes .env and
 * searches.json, and installs the browser the runner drives. Safe to run again;
 * existing values are the defaults.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { SLOTS } from "../src/config.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = path.join(ROOT, ".env");
const SEARCHES_PATH = path.join(ROOT, "searches.json");
const EXAMPLE_PATH = path.join(ROOT, "searches.example.json");

const SLOT_LABEL = {
  returned: "Returned ballots (everyone who has voted early or absentee)",
  returned_regulars: "Returned ballots, regular voters only (same, plus the vote-history filter)",
  registered: "Registered voters (active registered voters, no early-vote filter)",
  registered_regulars: "Registered voters, regular voters only (same, plus the vote-history filter)"
};

/** KEY=value lines → {KEY: value}, unquoting the values this script writes. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** Quote a value for Node's .env reader: a # or a space would otherwise cut it short. */
export function quoteEnv(v) {
  const s = String(v ?? "");
  return s.includes('"') ? `'${s}'` : `"${s}"`;
}

export function renderEnv(values) {
  return [
    "# Written by `npm run setup`. Keep this file private; it is git-ignored. Keep the quotes.",
    "",
    "# VoteBuilder login. Two-step sign-in is fine: `npm run check` lets you type the code once.",
    `VB_EMAIL=${quoteEnv(values.VB_EMAIL)}`,
    `VB_PASSWORD=${quoteEnv(values.VB_PASSWORD)}`,
    "# voters = My Voters (where saved searches live). campaign = My Campaign.",
    `VB_DATABASE=${quoteEnv(values.VB_DATABASE || "voters")}`,
    ""
  ].join("\n");
}

export function renderSearches(values) {
  const out = { crosstab: values.crosstab, column: "Precinct" };
  for (const slot of SLOTS) out[slot] = values[slot];
  return `${JSON.stringify(out, null, 2)}\n`;
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const env = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, "utf8")) : {};
  let searches = {};
  for (const p of [SEARCHES_PATH, EXAMPLE_PATH]) {
    if (fs.existsSync(p)) { try { searches = JSON.parse(fs.readFileSync(p, "utf8")); break; } catch { /* ask instead */ } }
  }
  const nameOf = (v) => (typeof v === "string" ? v : v?.search ?? "");
  const ask = async (label, current, { secret = false } = {}) => {
    const had = current ? (secret ? " [keep current]" : ` [${current}]`) : "";
    const answer = (await rl.question(`${label}${had}: `)).trim();
    return answer || current || "";
  };

  console.log("\nVote Chase — runner setup\n");
  console.log("Step 1 of 3: the VoteBuilder login the runner will use (see docs/security.md for which account to use).\n");
  const values = {};
  values.VB_EMAIL = await ask("VoteBuilder email", env.VB_EMAIL);
  values.VB_PASSWORD = await ask("VoteBuilder password", env.VB_PASSWORD, { secret: true });
  values.VB_DATABASE = (await ask("Database: voters (My Voters) or campaign (My Campaign)", env.VB_DATABASE || "voters")).toLowerCase();
  if (!["voters", "campaign"].includes(values.VB_DATABASE)) values.VB_DATABASE = "voters";

  console.log("\nStep 2 of 3: what to pull. The score name must match the Crosstab 1 picker on VAN's Counts and Crosstabs page exactly");
  console.log("(open the picker once by hand and copy it). The four names are your saved searches, exactly as VAN lists them.\n");
  values.crosstab = await ask("Score to crosstab by", searches.crosstab || "");
  for (const slot of SLOTS) {
    console.log(`  ${SLOT_LABEL[slot]}`);
    values[slot] = await ask(`  saved search name for "${slot}"`, nameOf(searches[slot]));
  }
  rl.close();

  const missing = ["VB_EMAIL", "VB_PASSWORD", "crosstab", ...SLOTS].filter((k) => !values[k]);
  if (missing.length) {
    console.error(`\nNot saved: ${missing.join(", ")} left blank. Run npm run setup again.`);
    process.exit(2);
  }
  fs.writeFileSync(ENV_PATH, renderEnv(values), { mode: 0o600 });
  fs.writeFileSync(SEARCHES_PATH, renderSearches(values));
  console.log(`\nSaved .env (your login, private) and searches.json (the score and search names).`);

  console.log("\nStep 3 of 3: installing the browser the runner drives (one time, about 150 MB)…\n");
  try {
    execSync("npx playwright install chromium", { cwd: ROOT, stdio: "inherit" });
  } catch {
    console.error("\nThe browser install did not finish. Run `npx playwright install chromium` in this folder and try again.");
    process.exit(1);
  }
  console.log(`
Done. Next:

  npm run check        one visible pass over the "returned" slot: sign in (type the one-time
                       code in the browser window if asked), watch it export, and write data.js
  npm run export:all   all four slots, no window; this is what the schedule runs
  npm run service -- install    run export:all every morning (see docs/automation.md)
`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
