#!/usr/bin/env node
/**
 * Turn a voter-level CSV into the `locations` tab layout (docs/data-contract.md).
 *
 *   node feeders/aggregate.mjs voters.csv > locations.csv
 *
 * One input row per registered voter, with a polling location, a turnout
 * score and a support score. Column names are auto-detected from common
 * vendor headers; override any of them with a flag:
 *
 *   --location <col>  --city <col>  --precinct <col>  --county <col>  --address <col>
 *   --turnout <col>   --support <col>
 *   --scale 100       divide scores by 100 (use when they run 0–100, not 0–1)
 *
 * Only sums leave this script. Nothing about any individual voter is written.
 * No dependencies; Node 18+.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Candidate header names per field, most specific first. Matching is case- and punctuation-insensitive. */
export const CANDIDATES = {
  location: ["polling_location", "polling_location_name", "polling_place", "polling_place_name", "location_name", "location", "poll_location"],
  city: ["polling_city", "polling_location_city", "polling_place_city", "city", "town", "municipality"],
  precinct: ["precinct_name", "precinct", "van_precinct_name", "precinctname"],
  county: ["county_name", "county"],
  address: ["polling_address", "polling_location_address", "polling_place_address", "address"],
  turnout: ["turnout_score", "turnout", "likely_vote", "general_turnout", "dnc_turnout", "gotv_score"],
  support: ["support_score", "support", "candidate_support", "senate_support", "dem_support", "partisanship", "dnc_support", "dem_partisanship"]
};

/** When no candidate matches exactly, the first header containing one of these words wins. */
const KEYWORDS = {
  location: [/polling.*(location|place)/, /location/],
  city: [/polling.*(city|town)/, /^(city|town)$/],
  precinct: [/precinct/],
  county: [/county/],
  address: [/address/],
  turnout: [/turnout/],
  support: [/support/, /partisan/]
};

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** RFC4180-enough CSV reader → array of header-keyed objects. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.replace(/^﻿/, ""));
  return { head, rows: rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""]))) };
}

const quote = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Pick a header for each field: the flag if given, else the first candidate present. */
export function resolveColumns(head, overrides = {}) {
  const byNorm = new Map(head.map((h) => [norm(h), h]));
  const cols = {}, missing = [];
  for (const [field, names] of Object.entries(CANDIDATES)) {
    if (overrides[field]) {
      if (!head.includes(overrides[field])) throw new Error(`--${field} "${overrides[field]}" is not a column in the file. Columns: ${head.join(", ")}`);
      cols[field] = overrides[field];
      continue;
    }
    const exact = names.map(norm).find((n) => byNorm.has(n));
    const fuzzy = exact ? null : KEYWORDS[field].map((re) => [...byNorm.keys()].find((n) => re.test(n))).find(Boolean);
    if (exact || fuzzy) cols[field] = byNorm.get(exact || fuzzy);
    else if (["location", "turnout", "support"].includes(field)) missing.push(field);
  }
  if (missing.length) {
    throw new Error(`could not find a column for ${missing.join(", ")}. Pass --${missing[0]} <column name>. Columns in the file: ${head.join(", ")}`);
  }
  return cols;
}

/** Sum per location. Returns rows in the `locations` layout, highest net vote gain first. */
export function aggregate(rows, cols, { scale = 1 } = {}) {
  const sites = new Map();
  let skipped = 0;
  for (const r of rows) {
    const name = String(r[cols.location] || "").trim();
    if (!name) { skipped++; continue; }
    const city = cols.city ? String(r[cols.city] || "").trim() : "";
    const key = `${name.toUpperCase()}|${city.toUpperCase()}`;
    const t = Number(r[cols.turnout]) / scale || 0;
    const p = Number(r[cols.support]) / scale || 0;
    let s = sites.get(key);
    if (!s) {
      s = { location_name: name, city, likely_voters: 0, likely_supporters: 0, registered: 0, precincts: new Set(), address: "", county: "" };
      sites.set(key, s);
    }
    s.likely_voters += t;
    s.likely_supporters += t * p;
    s.registered += 1;
    if (cols.precinct && r[cols.precinct]) s.precincts.add(String(r[cols.precinct]).trim());
    if (cols.address && !s.address) s.address = String(r[cols.address] || "").trim();
    if (cols.county && !s.county) s.county = String(r[cols.county] || "").trim();
  }
  const out = [...sites.values()].map((s) => ({
    location_name: s.location_name,
    city: s.city,
    likely_voters: Math.round(s.likely_voters * 10) / 10,
    likely_supporters: Math.round(s.likely_supporters * 10) / 10,
    registered: s.registered,
    precincts: [...s.precincts].sort().join(", "),
    address: s.address,
    county: s.county
  }));
  out.sort((a, b) => (2 * b.likely_supporters - b.likely_voters) - (2 * a.likely_supporters - a.likely_voters));
  return { locations: out, skipped };
}

export const HEADER = ["location_name", "city", "likely_voters", "likely_supporters", "registered", "precincts", "address", "county"];

export function toCsv(locations) {
  return [HEADER.join(","), ...locations.map((l) => HEADER.map((h) => quote(l[h])).join(","))].join("\n") + "\n";
}

function parseArgs(argv) {
  const opts = { overrides: {}, scale: 1, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--scale") opts.scale = Number(argv[++i]);
    else if (a.startsWith("--") && a.slice(2) in CANDIDATES) opts.overrides[a.slice(2)] = argv[++i];
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else opts.files.push(a);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.files.length) {
    console.error(`Usage: node feeders/aggregate.mjs voters.csv [--location col] [--city col] [--precinct col] [--turnout col] [--support col] [--scale 100] > locations.csv`);
    process.exit(opts.help ? 0 : 2);
  }
  const { head, rows } = parseCsv(readFileSync(opts.files[0], "utf8"));
  const cols = resolveColumns(head, opts.overrides);
  const { locations, skipped } = aggregate(rows, cols, { scale: opts.scale });
  console.error(`columns: ${Object.entries(cols).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  console.error(`${rows.length} voters → ${locations.length} locations${skipped ? ` (${skipped} rows had no location and were skipped)` : ""}`);
  const maxT = Math.max(...rows.slice(0, 1000).map((r) => Number(r[cols.turnout]) || 0));
  if (opts.scale === 1 && maxT > 1.5) console.error(`WARNING: turnout scores go up to ${maxT}; if they are 0–100, re-run with --scale 100`);
  process.stdout.write(toCsv(locations));
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (err) { console.error(`error: ${err.message}`); process.exit(1); }
}
