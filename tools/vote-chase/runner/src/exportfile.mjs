/**
 * Turns a Votebuilder Counts download into the file Vote Chase reads. The
 * download is either the file itself (direct download) or a zip holding one
 * file (My Export Files). Votebuilder's "Excel" export is text (UTF-16 HTML or
 * tab-separated), not a binary workbook. Before anything is written the file is
 * checked to be a counts crosstab and not a voter list.
 */
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

/** Cell headings that only appear in voter-level exports. */
const VOTER_LEVEL = new Set([
  "vanid", "van id", "voter file vanid", "first name", "last name", "firstname", "lastname",
  "middle name", "address", "street address", "mailing address", "phone", "cell phone", "home phone",
  "email", "dob", "date of birth"
]);

const normCell = (s) => String(s).replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();

/** Text of an export, honoring a UTF-16 or UTF-8 byte-order mark. */
export function decodeExport(buf) {
  if (buf.subarray(0, 4).toString("hex") === "d0cf11e0") {
    throw new Error("export is a binary Excel workbook, which Vote Chase cannot read");
  }
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  return buf.toString("utf8");
}

/** The first `limit` non-empty cells of an HTML-table or delimited export. */
export function firstCells(text, limit = 60) {
  const cells = /<t[dh][\s>]/i.test(text)
    ? [...text.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => normCell(m[1]))
    : text.split(/\r?\n/).slice(0, 12).flatMap((line) => line.split(/\t|,/).map(normCell));
  return cells.filter(Boolean).slice(0, limit);
}

/**
 * Throw unless `text` looks like a precinct counts crosstab. Refuses anything
 * with voter-level headings, so a wrong saved search can never leave a voter
 * list in the exports folder.
 */
export function assertCountsOnly(text) {
  const cells = firstCells(text);
  const voterLevel = cells.find((c) => VOTER_LEVEL.has(c));
  if (voterLevel) throw new Error(`the export has a "${voterLevel}" column, so it looks like a voter list, not counts; discarded`);
  if (!cells.includes("precinct")) {
    throw new Error(`the export has no "Precinct" heading, so it is not a precinct crosstab (first cells: ${cells.slice(0, 6).join(" | ") || "none"})`);
  }
}

/**
 * The export's bytes from a download body: unzips a My Export Files zip,
 * returns a direct download as it is, and rejects a real .xlsx workbook.
 */
export function unwrapExport(body) {
  if (body.subarray(0, 2).toString("latin1") !== "PK") return body;
  const entries = new AdmZip(body).getEntries().filter((e) => !e.isDirectory);
  if (entries.some((e) => /^\[Content_Types\]\.xml$/i.test(e.entryName))) {
    throw new Error("the download is a real .xlsx workbook; Vote Chase needs Votebuilder's Excel export (.xls)");
  }
  const hits = entries.filter((e) => /\.(xls|csv|txt)$/i.test(e.entryName));
  if (hits.length !== 1) {
    const names = entries.map((e) => e.entryName).join(", ") || "nothing";
    throw new Error(`expected one .xls in the export zip, found ${hits.length} (zip holds ${names})`);
  }
  return hits[0].getData();
}

/**
 * Check a download and save it as `<dir>/<fileName>`. The old file is replaced
 * only after the new one passes the checks, so a bad export never clobbers
 * yesterday's good one. Returns {file, path, bytes}.
 */
export function saveCounts(body, fileName, dir) {
  const data = unwrapExport(body);
  assertCountsOnly(decodeExport(data));
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, fileName);
  const tmp = `${out}.part`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, out);
  return { file: fileName, path: out, bytes: data.length };
}
