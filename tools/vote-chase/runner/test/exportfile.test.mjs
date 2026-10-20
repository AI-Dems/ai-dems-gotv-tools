import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import AdmZip from "adm-zip";
import { assertCountsOnly, decodeExport, firstCells, saveCounts, unwrapExport } from "../src/exportfile.mjs";

// Synthetic precinct crosstabs in the two shapes Votebuilder produces.
const HTML =
  "<table><tr><th>Precinct</th><th>0 to 9.99</th><th>90+</th><th>Total People</th></tr>" +
  "<tr><td>County - Town - 001</td><td>3</td><td>9</td><td>12</td></tr></table>";
const TSV = "Precinct\t0 to 9.99\t90+\tTotal People\r\nCounty - Town - 001\t3\t9\t12\r\n";
const VOTER_LIST = "VANID\tFirst Name\tLast Name\tPrecinct\r\n1\tA\tB\tCounty - Town - 001\r\n";

const utf16 = (s) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, "utf16le")]);

function zipOf(entries) {
  const zip = new AdmZip();
  for (const [name, body] of Object.entries(entries)) zip.addFile(name, Buffer.isBuffer(body) ? body : Buffer.from(body));
  return zip.toBuffer();
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vc-"));

test("decodeExport honors byte-order marks and rejects binary workbooks", () => {
  assert.equal(decodeExport(Buffer.from("﻿a,b", "utf8")), "a,b");
  assert.equal(decodeExport(utf16("a\tb")), "a\tb");
  assert.throws(() => decodeExport(Buffer.from("d0cf11e0a1b11ae1", "hex")), /binary Excel/);
});

test("firstCells reads HTML tables and delimited text", () => {
  assert.deepEqual(firstCells(HTML).slice(0, 3), ["precinct", "0 to 9.99", "90+"]);
  assert.deepEqual(firstCells(TSV).slice(0, 3), ["precinct", "0 to 9.99", "90+"]);
});

test("assertCountsOnly accepts precinct crosstabs and refuses voter lists", () => {
  assert.doesNotThrow(() => assertCountsOnly(HTML));
  assert.doesNotThrow(() => assertCountsOnly(TSV));
  assert.throws(() => assertCountsOnly(VOTER_LIST), /voter list/);
  assert.throws(() => assertCountsOnly("<table><tr><th>VAN ID</th><th>Precinct</th></tr></table>"), /voter list/);
  assert.throws(() => assertCountsOnly("Region\tTotal\r\nNorth\t5\r\n"), /no "Precinct" heading/);
});

test("unwrapExport returns a direct download, unzips a queued one, and refuses xlsx and odd zips", () => {
  const direct = utf16(HTML);
  assert.equal(unwrapExport(direct), direct);
  assert.deepEqual(unwrapExport(zipOf({ "Counts-1.xls": direct })), direct);
  assert.throws(() => unwrapExport(zipOf({ "[Content_Types].xml": "x", "xl/workbook.xml": "y" })), /real .xlsx/);
  assert.throws(() => unwrapExport(zipOf({ "a.pdf": "x" })), /found 0/);
  assert.throws(() => unwrapExport(zipOf({ "a.xls": "x", "b.xls": "y" })), /found 2/);
});

test("saveCounts writes <dir>/<slot>.xls and replaces an older file", () => {
  const dir = tmp();
  const out = saveCounts(utf16(HTML), "returned.xls", dir);
  assert.equal(out.path, path.join(dir, "returned.xls"));
  assert.deepEqual(fs.readdirSync(dir), ["returned.xls"]);
  saveCounts(zipOf({ "x.xls": utf16(TSV) }), "returned.xls", dir);
  assert.equal(decodeExport(fs.readFileSync(out.path)), TSV);
  fs.rmSync(dir, { recursive: true });
});

test("saveCounts leaves yesterday's file alone when the new export is a voter list", () => {
  const dir = tmp();
  saveCounts(utf16(HTML), "registered.xls", dir);
  assert.throws(() => saveCounts(utf16(VOTER_LIST), "registered.xls", dir), /voter list/);
  assert.equal(decodeExport(fs.readFileSync(path.join(dir, "registered.xls"))), HTML);
  assert.deepEqual(fs.readdirSync(dir), ["registered.xls"]);
  fs.rmSync(dir, { recursive: true });
});
