/**
 * Votebuilder delivers each export as a zip holding one file. Its ".xls" is
 * UTF-16 tab-separated text, not a binary workbook. Its ".csv" starts with a
 * "SEP=," line and leaves some comma-containing fields unquoted, so prefer xls.
 */
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";

export const FORMATS = ["xls", "csv"];
const DELIMITER = { xls: "\t", csv: "," };

/** Write the zip's single `.<format>` entry into `dir`. Returns {file, path}. */
export function extractExport(zipBuffer, format, dir) {
  const entries = new AdmZip(zipBuffer).getEntries().filter((e) => !e.isDirectory);
  const suffix = `.${String(format).toLowerCase()}`;
  const hits = entries.filter((e) => e.entryName.toLowerCase().endsWith(suffix));
  if (hits.length !== 1) {
    const names = entries.map((e) => e.entryName).join(", ") || "nothing";
    throw new Error(`expected one .${format} in the export zip, found ${hits.length} (zip holds ${names})`);
  }

  // basename() keeps a crafted entry name from writing outside `dir`.
  const file = path.basename(hits[0].entryName);
  const out = path.join(dir, file);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(out, hits[0].getData());
  return { file, path: out };
}

/** Text of an export, honoring a UTF-16 or UTF-8 byte-order mark. */
export function decodeExport(buf) {
  if (buf.subarray(0, 4).toString("hex") === "d0cf11e0") {
    throw new Error("export is a binary Excel workbook, which this sync cannot read");
  }
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  return buf.toString("utf8");
}

/** Every line of the export as an array of strings. */
export function parseExport(text, format) {
  return parse(text, {
    delimiter: DELIMITER[format],
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: false
  });
}

export function readExport(file, format) {
  return parseExport(decodeExport(fs.readFileSync(file)), format);
}
