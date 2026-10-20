/**
 * Turn VAN count exports into the data.js file that Vote Chase (index.html) loads automatically.
 *
 * Counts only. It never reads or writes individual voter records; if a file looks like a
 * voter list (VANID, names, addresses) it stops. History and settings from an existing
 * data.js at --out are kept. Standard library only, no dependencies.
 *
 * As a module: makeData({returned, registered, returnedRegulars?, registeredRegulars?, folder?,
 * crosswalk?, asof?, electionDay?, out}) → {out, summary, warnings}. Throws Error on a refusal.
 * As a command: node src/makedata.mjs --folder DIR --out data.js (see USAGE).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const USAGE = `Usage:
  node src/makedata.mjs --returned returned.xls --registered registered.xls \\
      [--returned-regulars rr.xls] [--registered-regulars gr.xls] \\
      [--crosswalk groups.csv] [--asof 2026-10-16] [--election-day 2026-11-03] \\
      --out /path/to/folder/with/index.html/data.js

Or point it at a folder and let it pick the newest file whose name contains each keyword:

  node src/makedata.mjs --folder ~/Downloads/van-exports --out ./data.js

  (keywords: "returned" / "registered", plus "regular" for the regular-voter versions,
   e.g. returned.xls, returned_regulars.xls, registered.xls, registered_regulars.xls)`;

const BAND_RE = /^(\d+(?:\.\d+)?)/;
const VOTERISH = /^(vanid|van id|voter file vanid|first name|last name|lastname|firstname|address|phone|email|cell)$/i;
const JUNK = /(\.part|\.tmp|\.crdownload|\.download)$/i;
const SLOT_KEYS = ["returned", "returned_regulars", "registered", "registered_regulars"];

/** A refusal with a message meant for the person running it. */
export class MakeDataError extends Error {}

// ---- Reading files ----

export function decode(buf, label = "file") {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 3 && buf[3] === 4) {
    throw new MakeDataError(`${label}: this is a real Excel workbook (.xlsx). Use VAN's Export To Excel file, or save as CSV.`);
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    for (let i = 0; i + 1 < swapped.length; i += 2) { const t = swapped[i]; swapped[i] = swapped[i + 1]; swapped[i + 1] = t; }
    return swapped.toString("utf16le");
  }
  let nulls = 0;
  for (let i = 1; i < Math.min(400, buf.length); i += 2) if (buf[i] === 0) nulls++;
  if (nulls > 150) return buf.toString("utf16le");
  const s = buf.toString("utf8");
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function unescapeHtml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return Object.hasOwn(ENTITIES, e.toLowerCase()) ? ENTITIES[e.toLowerCase()] : m;
  });
}

export function stripTags(h) {
  return unescapeHtml(h.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

export function tableFromHtml(txt) {
  const rows = [];
  for (const m of txt.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/** A small CSV/TSV reader: quotes, doubled quotes, delimiter picked from the first line. */
export function tableFromDelimited(txt) {
  const lines = txt.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = (lines[0].split("\t").length - 1) >= (lines[0].split(",").length - 1) ? "\t" : ",";
  const text = lines.join("\n");
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

export function num(v) {
  const s = String(v ?? "").replace(/,/g, "").replace(/ /g, "");
  if (s === "") return 0;
  const f = Number(s);
  return Number.isFinite(f) ? f : 0;
}

export function bandLow(label) {
  const s = String(label).trim();
  if (/^(unknown|no score|none)$/i.test(s)) return null;
  const m = BAND_RE.exec(s);
  return m ? parseFloat(m[1]) : null;
}

const localDate = (ms) => {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Parse one VAN Quick Counts crosstab (precinct × score band). `warn` receives advisory lines. */
export function parseCountReport(file, { warn = () => {} } = {}) {
  const txt = decode(fs.readFileSync(file), file);
  const t = /<table|<tr/i.test(txt) ? tableFromHtml(txt) : tableFromDelimited(txt);
  if (t.length < 3) throw new MakeDataError(`${file}: could not find a table.`);
  for (const r of t.slice(0, 3)) {
    if (r.some((x) => VOTERISH.test(String(x)))) throw new MakeDataError(`${file}: this looks like a voter list, not a count report. Export Counts > Quick Counts instead.`);
  }
  let hdr = -1;
  for (let i = 0; i < Math.min(5, t.length); i++) if (/^precinct/i.test(String(t[i][0] ?? ""))) { hdr = i; break; }
  if (hdr < 0) throw new MakeDataError(`${file}: the first column header should be 'Precinct' (Quick Counts, Column 1 = Precinct).`);
  const h1 = t[hdr], h2 = hdr + 1 < t.length ? t[hdr + 1] : [];
  const looksBand = (s) => bandLow(s) !== null || /^(unknown|less|under|below|over|above|more)\b/i.test(String(s));
  let bandRow, start;
  if (h2.some(looksBand)) { bandRow = h2; start = hdr + 2; }
  else if (h1.slice(1).some(looksBand)) { bandRow = h1.slice(1); start = hdr + 1; }
  else throw new MakeDataError(`${file}: could not find score band labels like '0 to 9.99' (Quick Counts, Crosstab 1 = your support score).`);
  let lead = 0;
  while (lead < bandRow.length && String(bandRow[lead]).trim() === "") lead++;
  const labels = bandRow.slice(lead);
  const cols = [];
  labels.forEach((l, i) => {
    const s = String(l).trim();
    if (s && !/^(%|percent|total people)$/i.test(s)) cols.push([s, i + 1]);
  });
  if (!cols.length) throw new MakeDataError(`${file}: no score band columns found.`);
  const expected = 1 + labels.length + 1;
  const rows = {}, dups = [];
  let vanTotal = null, bad = 0;
  for (const r of t.slice(start)) {
    if (!r || !r.length) continue;
    const name = String(r[0] ?? "").trim();
    if (!name) continue;
    if (/^total people$/i.test(name)) { vanTotal = num(r[r.length - 1]); continue; }
    if (r.length !== expected && r.length !== expected - 1) bad++;
    const vals = cols.map(([, idx]) => (idx < r.length ? num(r[idx]) : 0));
    if (Object.hasOwn(rows, name)) { dups.push(name); rows[name] = rows[name].map((a, i) => a + vals[i]); }
    else rows[name] = vals;
  }
  const n = Object.keys(rows).length;
  if (!n) warn(`warning: ${file}: no precinct rows under the header (0 people); treating every precinct as 0`);
  if (n && bad > n / 2) throw new MakeDataError(`${file}: the columns do not line up with the score bands. Use one crosstab (the score) and one column (Precinct).`);
  const total = Object.values(rows).reduce((a, v) => a + v.reduce((x, y) => x + y, 0), 0);
  if (vanTotal !== null && Math.round(vanTotal) !== Math.round(total)) {
    warn(`warning: ${file}: precinct rows add up to ${total.toLocaleString("en-US")} but VAN's Total People says ${vanTotal.toLocaleString("en-US")}`);
  }
  const unmatched = cols.map(([l]) => l).filter((l) => bandLow(l) === null && !/^unknown$/i.test(l));
  return {
    name: path.basename(file),
    bands: cols.map(([l]) => l),
    rows,
    vanTotalPeople: vanTotal,
    duplicates: [...new Set(dups)].sort(),
    unmatched,
    fileDate: localDate(fs.statSync(file).mtimeMs)
  };
}

export function parseCrosswalk(file) {
  const t = tableFromDelimited(decode(fs.readFileSync(file), file));
  if (t.length < 2) throw new MakeDataError(`${file}: the groups file needs a header row and at least one row.`);
  const hdr = t[0].map((c) => c.trim());
  const pi = hdr.findIndex((c) => /^precinct/i.test(c));
  if (pi < 0) throw new MakeDataError(`${file}: the groups file needs a column called 'precinct'.`);
  const keep = hdr.map((c, i) => (i !== pi && c ? i : -1)).filter((i) => i >= 0);
  const rows = {};
  for (const r of t.slice(1)) {
    const name = (pi < r.length ? r[pi] : "").trim();
    if (name) rows[name] = keep.map((i) => (i < r.length ? r[i] : "").trim());
  }
  return { columns: keep.map((i) => hdr[i]), rows };
}

/**
 * Newest file in `folder` whose name holds `keyword` (and 'regular' or not). Hidden files,
 * half-written files and sync-client leftovers are ignored; a file named exactly for the slot
 * (returned.xls, returned_regulars.xls) wins over a stray copy such as 'returned (1).xls'.
 */
export function newest(folder, keyword, regular) {
  const cands = [];
  for (const name of fs.existsSync(folder) ? fs.readdirSync(folder) : []) {
    const n = name.toLowerCase();
    const p = path.join(folder, name);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (n.startsWith(".") || JUNK.test(n) || !st.isFile() || st.size === 0) continue;
    if (n.includes(keyword) && (n.includes("regular") === regular)) cands.push({ p, mtime: st.mtimeMs, stem: path.parse(n).name });
  }
  if (!cands.length) return null;
  const stem = keyword + (regular ? "_regulars" : "");
  const exact = cands.filter((c) => c.stem === stem || c.stem === stem.replace(/s$/, ""));
  return (exact.length ? exact : cands).reduce((a, b) => (b.mtime > a.mtime ? b : a)).p;
}

/** The object inside an existing data.js, {} when the file is missing or empty, null when unreadable. */
export function readPrevious(out) {
  if (!fs.existsSync(out) || fs.statSync(out).size === 0) return {};
  try {
    const m = /=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(fs.readFileSync(out, "utf8"));
    const o = m ? JSON.parse(m[1]) : null;
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

// ---- The conversion ----

/**
 * Build data.js. Returns {out, summary, warnings}. Options are the CLI flags in camelCase:
 * returned, registered, returnedRegulars, registeredRegulars, folder, crosswalk, asof,
 * electionDay, out. Throws MakeDataError with a message for the person running it.
 */
export function makeData(opts) {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const paths = {
    returned: opts.returned, registered: opts.registered,
    returned_regulars: opts.returnedRegulars, registered_regulars: opts.registeredRegulars
  };
  if (opts.folder) {
    for (const [slot, kw, reg] of [["returned", "returned", false], ["registered", "registered", false],
      ["returned_regulars", "returned", true], ["registered_regulars", "registered", true]]) {
      paths[slot] = paths[slot] || newest(opts.folder, kw, reg);
    }
  }
  if (!paths.returned || !paths.registered) {
    throw new MakeDataError("Need at least --returned and --registered (or --folder with files named returned*.xls and registered*.xls).");
  }
  if (!opts.out) throw new MakeDataError("Need --out (the path of data.js, next to index.html).");
  const files = {};
  for (const slot of Object.keys(paths)) if (paths[slot]) files[slot] = parseCountReport(paths[slot], { warn });
  const dates = new Set(Object.values(files).map((f) => f.fileDate));
  if (dates.size > 1) {
    warn("warning: the files are from different days (" + Object.keys(files).map((k) => `${k} ${files[k].fileDate}`).join(", ")
      + "); the page will show them as one pull dated by the returned file");
  }
  const asof = opts.asof || files.returned.fileDate;
  const prev = readPrevious(opts.out);
  if (prev === null) {
    throw new MakeDataError(`${opts.out}: the existing data.js could not be read, so it was not overwritten (its history and settings would be lost). If it is damaged, rename or delete it and run again.`);
  }
  const history = Object.assign({}, prev.history || {});
  const sum = (slot) => Object.values(files[slot].rows).reduce((a, v) => a + v.reduce((x, y) => x + y, 0), 0);
  history[asof] = Object.fromEntries(SLOT_KEYS.map((k) => [k, k in files ? sum(k) : null]));
  const data = {
    version: 1,
    asof,
    asofFrom: files.returned.fileDate,
    electionDay: opts.electionDay || prev.electionDay || "",
    files,
    crosswalk: opts.crosswalk ? parseCrosswalk(opts.crosswalk) : (prev.crosswalk ?? null),
    history,
    source: "data",
    generated: localStamp()
  };
  for (const k of ["buckets", "noScoreChase", "preset", "basis", "sort", "top", "breakdown"]) if (k in prev) data[k] = prev[k];
  // Written to a temporary file and swapped in, so the page never sees a half-written data.js.
  const tmp = `${opts.out}.tmp`;
  fs.writeFileSync(tmp, `window.VOTECHASE_DATA = ${JSON.stringify(data)};\n`, "utf8");
  fs.renameSync(tmp, opts.out);
  const summary = `wrote ${opts.out}: as of ${asof}; ` + Object.keys(files)
    .map((k) => `${k} ${sum(k).toLocaleString("en-US")} people in ${Object.keys(files[k].rows).length} precincts`).join("; ");
  return { out: opts.out, summary, warnings };
}

function localStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---- Command line ----

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      returned: { type: "string" }, registered: { type: "string" },
      "returned-regulars": { type: "string" }, "registered-regulars": { type: "string" },
      folder: { type: "string" }, crosswalk: { type: "string" }, asof: { type: "string" },
      "election-day": { type: "string" }, out: { type: "string" }, help: { type: "boolean", short: "h", default: false }
    }
  });
  return {
    help: values.help,
    returned: values.returned, registered: values.registered,
    returnedRegulars: values["returned-regulars"], registeredRegulars: values["registered-regulars"],
    folder: values.folder, crosswalk: values.crosswalk, asof: values.asof,
    electionDay: values["election-day"], out: values.out
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let opts;
  try { opts = parseCli(process.argv.slice(2)); } catch (err) { console.error(`${err.message}\n\n${USAGE}`); process.exit(2); }
  if (opts.help) { console.log(USAGE); process.exit(0); }
  try {
    const res = makeData(opts);
    for (const w of res.warnings) console.error(w);
    console.log(res.summary);
  } catch (err) {
    if (err instanceof MakeDataError) { console.error(err.message); process.exit(1); }
    throw err;
  }
}
