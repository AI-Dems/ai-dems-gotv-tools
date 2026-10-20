/**
 * Runner configuration. Campaign-specific values (interval, election date,
 * timezone, LBJ election name) live on the Sheet's Setup tab and are fetched
 * each pass. The runner itself only needs where the Sheet is, the token, and
 * where LBJ is.
 *
 *   .env   SHEET_URL, SHEET_TOKEN, LBJ_URL
 *   CLI    --once, --dry-run, --pick
 */
import { parseArgs } from "node:util";

export const USAGE = `Usage:
  npm start                 scrape every N minutes (N from the Sheet's Setup tab) and push
  npm run once              one scrape and push, then exit
  npm run check             one scrape, print what would be pushed, push nothing
  npm run pick              open the dashboard, let you set its filters by hand (e.g. a past date), scrape that page once, push nothing

Options:
  --once      one pass and exit
  --dry-run   never POST to the Sheet
  --pick      wait for you to set the dashboard filters, then scrape without reloading (implies --once)`;

export function parseArgv(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      once: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      pick: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });
  if (values.help) return { help: true };
  return { once: values.once || values.pick, dryRun: values["dry-run"], pick: values.pick };
}

/** {url, token, lbjUrl} from the environment. Throws a setup hint when something is missing. */
export function loadEnv(env = process.env) {
  const url = String(env.SHEET_URL ?? "").trim();
  const token = String(env.SHEET_TOKEN ?? "").trim();
  const lbjUrl = String(env.LBJ_URL ?? "").trim().replace(/\/$/, "");
  // Workspace accounts get a /a/<domain>/ segment in the URL; personal accounts don't.
  const isScript = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]+\/exec$/.test(url);
  if (!isScript && !/^http:\/\/localhost/.test(url)) {
    throw new Error("SHEET_URL in .env must be the web app URL from Polling Priority → Show runner access (ends in /exec). Run `npm run setup`.");
  }
  if (!token) throw new Error("SHEET_TOKEN is missing from .env. Run `npm run setup`.");
  if (!/^https?:\/\//.test(lbjUrl)) throw new Error("LBJ_URL in .env must start with https://. Run `npm run setup`.");
  return { url, token, lbjUrl };
}

/** Validate the config the Sheet served. Setup is typed by hand, so check it. */
export function sheetConfig(raw) {
  const everyMin = Number(raw?.everyMin);
  if (!(everyMin >= 1)) throw new Error(`Setup: "Scrape every (minutes)" is ${raw?.everyMin}`);
  const timezone = String(raw?.timezone || "America/New_York");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(`Setup: unknown timezone "${timezone}"`);
  }
  return { everyMin, timezone, electionDate: String(raw?.electionDate || ""), lbjElectionName: String(raw?.lbjElectionName || "") };
}

/** Today's yyyy-mm-dd in `timeZone`. */
export function todayIn(timeZone, now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone });
}
