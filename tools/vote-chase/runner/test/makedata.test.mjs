import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { MakeDataError, bandLow, decode, makeData, newest, num, parseCountReport, parseCrosswalk, readPrevious, tableFromDelimited } from "../src/makedata.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vcmd-"));
const utf16 = (s) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, "utf16le")]);
const html = (rows) => `<html><body><table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
const vanFile = (dir, name, rows) => { const p = path.join(dir, name); fs.writeFileSync(p, utf16(html(rows))); return p; };
const BANDS = ["", "0 to 9.99", "%", "10 to 19.99", "%", "90+", "%", "Unknown", "%", ""];
const HEADER = ["Precinct", "", "", "", "", "", "", "", "", "Total People"];

test("decode handles VAN's UTF-16 export, UTF-8 with BOM, and refuses .xlsx", () => {
  assert.equal(decode(utf16("héllo")), "héllo");
  assert.equal(decode(Buffer.from("﻿abc", "utf8")), "abc");
  assert.throws(() => decode(Buffer.from("PK\x03\x04rest", "latin1"), "x.xlsx"), /real Excel workbook/);
});

test("num, bandLow and the delimited reader", () => {
  assert.equal(num("2,000"), 2000);
  assert.equal(num(""), 0);
  assert.equal(num("abc"), 0);
  assert.equal(num("1.5"), 1.5);
  assert.equal(bandLow("0 to 9.99"), 0);
  assert.equal(bandLow("90+"), 90);
  assert.equal(bandLow("Unknown"), null);
  assert.equal(bandLow("Less than 10"), null);
  assert.deepEqual(tableFromDelimited('a,b\n"x, y","say ""hi"""\n'), [["a", "b"], ["x, y", 'say "hi"']]);
  assert.deepEqual(tableFromDelimited("a\tb\n1\t2\n"), [["a", "b"], ["1", "2"]]);
});

test("parseCountReport reads a VAN crosstab with percent columns, sums duplicates, keeps the VAN total", () => {
  const dir = tmp();
  const p = vanFile(dir, "returned.xls", [
    HEADER, BANDS,
    ["A - 001", "1", "10%", "2", "20%", "3", "30%", "4", "40%", "10"],
    ["A - 002", "5", "", "6", "", "7", "", "8", "", "26"],
    ["A - 001", "1", "", "1", "", "1", "", "1", "", "4"],
    ["Total People", "7", "", "9", "", "11", "", "13", "", "40"]
  ]);
  const f = parseCountReport(p);
  assert.deepEqual(f.bands, ["0 to 9.99", "10 to 19.99", "90+", "Unknown"]);
  assert.deepEqual(f.rows, { "A - 001": [2, 3, 4, 5], "A - 002": [5, 6, 7, 8] });
  assert.equal(f.vanTotalPeople, 40);
  assert.deepEqual(f.duplicates, ["A - 001"]);
  assert.deepEqual(f.unmatched, []);
  assert.match(f.fileDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("parseCountReport refuses voter lists, non-crosstabs and misaligned columns", () => {
  const dir = tmp();
  assert.throws(() => parseCountReport(vanFile(dir, "v.xls", [["VANID", "First Name", "Last Name"], ["1", "a", "b"], ["2", "c", "d"]])), /voter list/);
  assert.throws(() => parseCountReport(vanFile(dir, "n.xls", [["County", "x"], ["a", "1"], ["b", "2"]])), /should be 'Precinct'/);
  assert.throws(() => parseCountReport(vanFile(dir, "b.xls", [["Precinct", "x"], ["", "foo"], ["a", "1"]])), /score band labels/);
  assert.throws(() => parseCountReport(vanFile(dir, "m.xls", [HEADER, BANDS, ["a", "1"], ["b", "1"], ["c", "1"]])), /do not line up/);
});

test("a zero-person export is zero rows with a warning, not an error", () => {
  const dir = tmp();
  const warnings = [];
  const f = parseCountReport(vanFile(dir, "z.xls", [HEADER, BANDS, ["Total People", "0", "", "0", "", "0", "", "0", "", "0"]]), { warn: (m) => warnings.push(m) });
  assert.deepEqual(f.rows, {});
  assert.equal(f.vanTotalPeople, 0);
  assert.match(warnings[0], /0 people/);
});

test("parseCrosswalk needs a precinct column and keeps the others", () => {
  const dir = tmp();
  const p = path.join(dir, "g.csv");
  fs.writeFileSync(p, 'precinct,county,"turf, name"\n"A - 001",X,"North ""A"""\nA - 002,Y,South\n');
  assert.deepEqual(parseCrosswalk(p), { columns: ["county", "turf, name"], rows: { "A - 001": ["X", 'North "A"'], "A - 002": ["Y", "South"] } });
  fs.writeFileSync(p, "a,b\n1,2\n");
  assert.throws(() => parseCrosswalk(p), /column called 'precinct'/);
});

test("newest ignores junk and stray copies and prefers the slot's own file", () => {
  const dir = tmp();
  const w = (n, body = "x", when = Date.now()) => { const p = path.join(dir, n); fs.writeFileSync(p, body); fs.utimesSync(p, when / 1000, when / 1000); return p; };
  const good = w("returned.xls", "x", Date.now() - 60000);
  w("returned (1).xls");
  w("returned.xls.part");
  w("._returned.xls");
  w("returned_old.xls", "", Date.now());
  assert.equal(newest(dir, "returned", false), good);
  assert.equal(newest(dir, "returned", true), null);
  const rr = w("returned_regulars.xls");
  assert.equal(newest(dir, "returned", true), rr);
  assert.equal(newest(path.join(dir, "nope"), "returned", false), null);
});

test("readPrevious: missing or empty is {}, unreadable is null", () => {
  const dir = tmp();
  const p = path.join(dir, "data.js");
  assert.deepEqual(readPrevious(p), {});
  fs.writeFileSync(p, "");
  assert.deepEqual(readPrevious(p), {});
  fs.writeFileSync(p, "garbage");
  assert.equal(readPrevious(p), null);
  fs.writeFileSync(p, 'window.VOTECHASE_DATA = {"version":1,"history":{"2026-10-01":{"returned":1}}};\n');
  assert.equal(readPrevious(p).history["2026-10-01"].returned, 1);
});

test("makeData writes data.js atomically, carries history and settings, and refuses to clobber a broken file", () => {
  const dir = tmp();
  const ret = vanFile(dir, "returned.xls", [HEADER, BANDS, ["A - 001", "1", "", "2", "", "3", "", "4", "", "10"], ["Total People", "1", "", "2", "", "3", "", "4", "", "10"]]);
  const reg = vanFile(dir, "registered.xls", [HEADER, BANDS, ["A - 001", "10", "", "20", "", "30", "", "40", "", "100"], ["Total People", "10", "", "20", "", "30", "", "40", "", "100"]]);
  const out = path.join(dir, "data.js");
  fs.writeFileSync(out, 'window.VOTECHASE_DATA = {"version":1,"history":{"2026-10-01":{"returned":5,"registered":100}},"preset":"4","electionDay":"2026-11-03"};\n');
  const res = makeData({ returned: ret, registered: reg, asof: "2026-10-02", out });
  const data = readPrevious(out);
  assert.equal(data.asof, "2026-10-02");
  assert.equal(data.electionDay, "2026-11-03");
  assert.equal(data.preset, "4");
  assert.deepEqual(Object.keys(data.history), ["2026-10-01", "2026-10-02"]);
  assert.deepEqual(data.history["2026-10-02"], { returned: 10, returned_regulars: null, registered: 100, registered_regulars: null });
  assert.equal(data.source, "data");
  assert.match(res.summary, /returned 10 people in 1 precincts; registered 100 people in 1 precincts/);
  assert.equal(fs.existsSync(`${out}.tmp`), false);
  fs.writeFileSync(out, "garbage");
  assert.throws(() => makeData({ returned: ret, registered: reg, out }), MakeDataError);
  assert.equal(fs.readFileSync(out, "utf8"), "garbage");
  assert.throws(() => makeData({ folder: path.join(dir, "empty"), out: path.join(dir, "x.js") }), /Need at least/);
});
