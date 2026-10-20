/**
 * Command-line options for export.mjs, the searches.json that maps each
 * Vote Chase slot to a saved Votebuilder search, and the small pure helpers for
 * file names and the data.js converter's options. --account picks the Votebuilder login
 * and the database the saved searches live in (My Voters by default).
 */
import { parseArgs } from "node:util";

/** The four Counts crosstabs Vote Chase reads, and the file each is saved as. */
export const SLOTS = ["returned", "returned_regulars", "registered", "registered_regulars"];

/**
 * One login per run, from .env. VB_DATABASE chooses the account: "voters"
 * (My Voters, the default) or "campaign" (My Campaign).
 */
export const ACCOUNTS = {
  voters: { database: "My Voters", emailVar: "VB_EMAIL", passwordVar: "VB_PASSWORD" },
  campaign: { database: "My Campaign", emailVar: "VB_EMAIL", passwordVar: "VB_PASSWORD" }
};

export const USAGE = `Usage:
  npm start -- [options]

Reads saved search names from searches.json and writes one counts file per slot
(returned, returned_regulars, registered, registered_regulars) as <slot>.xls.

Options:
  --out <dir>              Folder for the four .xls files (default ./exports)
  --only <slot>            Export just this slot (repeatable)
  --searches <file>        Slot-to-search-name file (default searches.json)
  --then-make-data         After a fully successful pass, write data.js from the four files
  --data-out <file>        Where data.js is written (default ../data.js, next to index.html)
  --election-day <date>    Written into data.js as the election date (YYYY-MM-DD)
  --account <name>         voters (My Voters) or campaign (My Campaign) (default: VB_DATABASE, else voters)
  --once                   Run one pass and exit (the default)
  --every <minutes>        Repeat a pass every N minutes during --hours instead of exiting
  --hours <start>-<end>    Active hours with --every, local time (default 9-21; 0-24 = always)
  --headed                 Show the browser (takes focus; for debugging)`;

/** "9-21" → {start: 9, end: 21}. */
export function parseHours(s) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(s).trim());
  const start = m ? Number(m[1]) : NaN;
  const end = m ? Number(m[2]) : NaN;
  if (!(start >= 0 && end <= 24 && start < end)) {
    throw new Error(`--hours "${s}" must look like 9-21 (start before end, 0-24)`);
  }
  return { start, end };
}

export function inHours(date, { start, end }) {
  const h = date.getHours();
  return h >= start && h < end;
}

/** The file a slot is saved as, which is what the converter's --folder mode looks for. */
export function slotFile(slot) {
  if (!SLOTS.includes(slot)) throw new Error(`unknown slot "${slot}" (slots: ${SLOTS.join(", ")})`);
  return `${slot}.xls`;
}

/**
 * Validate the parsed searches.json. Each slot value is a saved search name, or
 * {search, crosstab?, column?}. Top-level "crosstab" and "column" are defaults
 * for every slot. `crosstab` is the score the script picks as Crosstab 1 on the
 * Counts page (VAN does not save it with the search); `column` is Column 1,
 * default "Precinct". Older keys expectCrosstab/expectColumn are accepted as
 * aliases. Returns {slot: {slot, search, crosstab, column, expectCrosstab, expectColumn}}.
 */
export const RESERVED = ["crosstab", "column"];
export function parseSearches(raw, slots = SLOTS) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`searches.json must be an object mapping slot names to saved search names`);
  }
  const unknown = Object.keys(raw).filter((k) => !SLOTS.includes(k) && !RESERVED.includes(k));
  if (unknown.length) throw new Error(`searches.json has unknown slot(s) ${unknown.join(", ")} (slots: ${SLOTS.join(", ")})`);
  const text = (x) => (x == null || x === "" ? null : String(x).trim());
  const defCrosstab = text(raw.crosstab);
  const defColumn = raw.column === undefined ? "Precinct" : text(raw.column);

  const out = {};
  for (const slot of slots) {
    const v = raw[slot];
    if (v === undefined) throw new Error(`searches.json has no entry for "${slot}"`);
    const entry = typeof v === "string" ? { search: v } : v;
    const search = String(entry?.search ?? "").trim();
    if (!search) throw new Error(`searches.json: "${slot}" needs a saved search name`);
    const crosstab = text(entry.crosstab ?? entry.expectCrosstab) ?? defCrosstab;
    const column = entry.column !== undefined ? text(entry.column) : entry.expectColumn !== undefined ? text(entry.expectColumn) : defColumn;
    out[slot] = { slot, search, crosstab, column, expectCrosstab: crosstab, expectColumn: column };
  }
  return out;
}

/**
 * Options for makeData() from the per-slot export paths: {returned, registered,
 * returnedRegulars, registeredRegulars}, leaving out slots without a file.
 */
export function makeDataOptions(files) {
  const camel = { returned: "returned", registered: "registered", returned_regulars: "returnedRegulars", registered_regulars: "registeredRegulars" };
  const out = {};
  for (const slot of SLOTS) if (files[slot]) out[camel[slot]] = files[slot];
  return out;
}

export function parseConfig(argv, env = process.env) {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: "string", default: "exports" },
      only: { type: "string", multiple: true, default: [] },
      searches: { type: "string", default: "searches.json" },
      "then-make-data": { type: "boolean", default: false },
      "data-out": { type: "string", default: "../data.js" },
      "election-day": { type: "string" },
      account: { type: "string" },
      once: { type: "boolean", default: false },
      every: { type: "string" },
      hours: { type: "string", default: "9-21" },
      headed: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });
  if (values.help) return { help: true };

  const accountName = (values.account ?? env.VB_DATABASE ?? "voters").trim().toLowerCase();
  if (!Object.hasOwn(ACCOUNTS, accountName)) {
    throw new Error(`${values.account ? "--account" : "VB_DATABASE"} "${accountName}" must be one of ${Object.keys(ACCOUNTS).join(", ")}`);
  }
  const bad = values.only.filter((s) => !SLOTS.includes(s));
  if (bad.length) throw new Error(`--only "${bad.join(", ")}" must be one of ${SLOTS.join(", ")}`);
  if (values.once && values.every) throw new Error("use either --once or --every, not both");
  const everyMin = values.every === undefined ? null : Number(values.every);
  if (everyMin !== null && !(everyMin >= 1)) throw new Error(`--every "${values.every}" must be a number of minutes, 1 or more`);
  const electionDay = values["election-day"]?.trim() || null;
  if (electionDay && !/^\d{4}-\d{2}-\d{2}$/.test(electionDay)) throw new Error(`--election-day "${electionDay}" must look like 2026-11-03`);

  return {
    account: { name: accountName, ...ACCOUNTS[accountName] },
    slots: values.only.length ? SLOTS.filter((s) => values.only.includes(s)) : [...SLOTS],
    out: values.out,
    searchesFile: values.searches,
    thenMakeData: values["then-make-data"],
    dataOut: values["data-out"],
    electionDay,
    everyMin,
    once: everyMin === null,
    hours: parseHours(values.hours),
    headed: values.headed
  };
}
