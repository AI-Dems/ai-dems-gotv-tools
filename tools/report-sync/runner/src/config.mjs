/**
 * Runner configuration. Everything campaign-specific (which reports, how
 * often, active hours) lives on the Sheet's Setup tab and is fetched each
 * pass. The runner itself only needs where the Sheet is and how to log in.
 *
 *   .env   SYNC_URL, SYNC_TOKEN, VB_CAMPAIGN_EMAIL/PASSWORD, VB_VOTERS_EMAIL/PASSWORD
 *   CLI    --account campaign|voters, --once, --headed
 */
import { parseArgs } from "node:util";

/** Each account logs in with its own .env variables and stays in one database. */
export const ACCOUNTS = {
  campaign: { database: "My Campaign", emailVar: "VB_CAMPAIGN_EMAIL", passwordVar: "VB_CAMPAIGN_PASSWORD" },
  voters: { database: "My Voters", emailVar: "VB_VOTERS_EMAIL", passwordVar: "VB_VOTERS_PASSWORD" }
};

export const USAGE = `Usage:
  npm start -- --account <campaign|voters> [--once] [--headed]

Options:
  --account <name>   Votebuilder account: campaign (My Campaign) or voters (My Voters). Default campaign
  --once             Run one pass and exit, ignoring active hours
  --headed           Show the browser (takes focus; for debugging)

Reports, interval and active hours come from the Setup tab of the Sheet in SYNC_URL.`;

export function parseArgv(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      account: { type: "string", default: "campaign" },
      once: { type: "boolean", default: false },
      headed: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });
  if (values.help) return { help: true };
  const name = values.account.trim().toLowerCase();
  if (!Object.hasOwn(ACCOUNTS, name)) {
    throw new Error(`--account "${values.account}" must be one of ${Object.keys(ACCOUNTS).join(", ")}`);
  }
  return { account: { name, ...ACCOUNTS[name] }, once: values.once, headed: values.headed };
}

/** {url, token} from the environment. Throws a setup hint when either is missing. */
export function loadSync(env = process.env) {
  const url = String(env.SYNC_URL ?? "").trim();
  const token = String(env.SYNC_TOKEN ?? "").trim();
  if (!/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]+\/exec$/.test(url)) {
    throw new Error("SYNC_URL in .env must be the web app URL from the Apps Script editor, Deploy → Manage deployments (ends in /exec). Run `npm run setup`.");
  }
  if (!token) throw new Error("SYNC_TOKEN is missing from .env. Run `npm run setup`.");
  return { url, token };
}

/** Hour of the day (0–23) in `timeZone`. */
export function hourIn(date, timeZone) {
  const h = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone }).format(date);
  return Number(h) % 24;
}

export function inHours(date, { start, end }, timeZone) {
  const h = hourIn(date, timeZone);
  return h >= start && h < end;
}

/**
 * Validate the config the Sheet served and keep the reports for `database`.
 * Setup is edited by hand, so the checks here mirror the ones in the Sheet.
 */
export function sheetConfig(raw, database) {
  const everyMin = Number(raw?.everyMin);
  if (!(everyMin >= 1)) throw new Error(`Setup: "Sync every (minutes)" is ${raw?.everyMin}`);
  const hours = { start: Number(raw?.hours?.start), end: Number(raw?.hours?.end) };
  if (!(hours.start >= 0 && hours.end <= 24 && hours.start < hours.end)) throw new Error("Setup: active hours are not 0 ≤ start < end ≤ 24");
  const format = String(raw?.format ?? "xls");
  if (!["xls", "csv"].includes(format)) throw new Error(`Setup: export format "${format}" must be xls or csv`);
  const timezone = String(raw?.timezone || "America/New_York");
  try {
    hourIn(new Date(), timezone);
  } catch {
    throw new Error(`Setup: unknown timezone "${timezone}"`);
  }
  const reports = (raw?.reports ?? [])
    .filter((r) => r.enabled !== false && r.database === database)
    .map((r) => ({ name: String(r.name), tab: String(r.tab) }));
  return { everyMin, hours, format, timezone, reports };
}
