// Tests for src/exportfile.mjs: unzipping, decoding and parsing a Votebuilder export.
// Fixtures are built in code from obviously fake data; there are no real people here.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { decodeExport, parseExport, readExport, extractExport } from "../src/exportfile.mjs";

const HEADER = ["VANID", "Name", "Last Name", "Preferred Phone", "Shift Date", "Status", "Zip", "Notes"];
const ROWS = [
  ["100000001", "Test Volunteer One", "Volunteer, One", "(555) 010-0001", "10/20/2026", "Scheduled", "48823", "plain"],
  ["100000002", "Test Volunteer Two", "Volunteer, Two", "(555) 010-0002", "10/20/2026", "Completed", "48823-1234", 'He said "hi" mid-field'],
  ["100000003", "Test Volunteer Three", "Volunteer, Three", "", "10/21/2026", "Scheduled", "48824", '"quoted, with comma"'],
  ["100000004", "Test Volunteer Four", "Volunteer, Four", "(555) 010-0004", "10/21/2026", "", "48825", ""]
];

// Votebuilder's ".xls": UTF-16LE with a BOM, tab-separated, CRLF, and a trailing blank line.
function xlsBytes() {
  const tsv = [HEADER, ...ROWS].map((r) => r.join("\t")).join("\r\n") + "\r\n\r\n";
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tsv, "utf16le")]);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "report-sync-test-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function zipOf(entries) {
  const zip = new AdmZip();
  for (const [name, data] of Object.entries(entries)) zip.addFile(name, data);
  return zip.toBuffer();
}

test("decodeExport honors UTF-16 and UTF-8 byte-order marks, and plain UTF-8", () => {
  assert.equal(decodeExport(xlsBytes()).startsWith("VANID\t"), true);
  assert.equal(decodeExport(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a,b")])), "a,b");
  assert.equal(decodeExport(Buffer.from("a,b")), "a,b");
});

test("decodeExport refuses a binary Excel workbook", () => {
  const workbook = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
  assert.throws(() => decodeExport(workbook), /binary Excel workbook/);
});

test("parseExport reads the xls fixture the same way the Apps Script parser does", () => {
  const rows = parseExport(decodeExport(xlsBytes()), "xls");
  const nonEmpty = rows.filter((r) => r.some((c) => c !== ""));
  assert.equal(nonEmpty.length, 5);
  assert.deepEqual(rows[0], HEADER);
  assert.equal(rows[1][2], "Volunteer, One");
  assert.equal(rows[2][7], 'He said "hi" mid-field');
  assert.equal(rows[3][7], "quoted, with comma");
  assert.equal(rows[4][5], "");
});

test("readExport keeps a trailing all-empty row that the Apps Script parseExport drops", () => {
  // Documents current behavior, not necessarily desired behavior: the upload
  // path (apps-script/Import.js) trims trailing blank rows and this path does not.
  const file = path.join(scratch, "trailing-blank.xls");
  fs.writeFileSync(file, xlsBytes());
  const rows = readExport(file, "xls");
  assert.equal(rows.length, 6, "header + 4 data rows + 1 trailing blank row");
  assert.ok(rows.at(-1).every((c) => c === ""), "the last row is all empty");
  assert.ok(rows.slice(0, -1).every((r) => r.some((c) => c !== "")), "every earlier row has data");
});

test("extractExport writes the zip's single entry of the requested format", () => {
  const dir = path.join(scratch, "single");
  const result = extractExport(zipOf({ "EventParticipantReport-2026-10-20.xls": xlsBytes() }), "xls", dir);
  assert.equal(result.file, "EventParticipantReport-2026-10-20.xls");
  assert.deepEqual(fs.readFileSync(result.path), xlsBytes());
});

test("extractExport only counts entries of the requested format: a.xls plus b.csv is fine for xls", () => {
  const dir = path.join(scratch, "mixed");
  const result = extractExport(zipOf({ "a.xls": xlsBytes(), "b.csv": Buffer.from("x") }), "xls", dir);
  assert.equal(result.file, "a.xls");
});

test("extractExport refuses a zip with two entries of the requested format", () => {
  const dir = path.join(scratch, "two-xls");
  const zip = zipOf({ "a.xls": xlsBytes(), "b.xls": xlsBytes() });
  assert.throws(() => extractExport(zip, "xls", dir), /expected one \.xls .* found 2/);
});

test("extractExport refuses a zip with none of the requested format", () => {
  const dir = path.join(scratch, "none");
  assert.throws(() => extractExport(zipOf({ "b.csv": Buffer.from("x") }), "xls", dir), /found 0/);
});

test("extractExport keeps a crafted entry name inside the target folder", () => {
  const dir = path.join(scratch, "crafted");
  const result = extractExport(zipOf({ "../../escape.xls": xlsBytes() }), "xls", dir);
  assert.equal(result.file, "escape.xls");
  assert.equal(path.dirname(result.path), dir);
});
