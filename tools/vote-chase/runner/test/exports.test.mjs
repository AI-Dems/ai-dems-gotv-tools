import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSetting, exportIdFrom, newExports, searchNamePattern } from "../src/votebuilder.mjs";

test("exportIdFrom reads the download link", () => {
  assert.equal(exportIdFrom("ExportFileDownloadHandler.ashx?exportFileId=639271530767407085"), "639271530767407085");
  assert.equal(exportIdFrom(null), null);
});

test("newExports returns unseen rows, newest first", () => {
  const rows = [
    { id: "639271530767407085", file: "old" },
    { id: "639271540000000000", file: "b" },
    { id: "639271550000000000", file: "c" },
    { id: null, file: "pending" }
  ];
  assert.deepEqual(newExports(["639271530767407085"], rows).map((r) => r.file), ["c", "b"]);
  assert.deepEqual(newExports(rows.map((r) => r.id), rows), []);
});

test("searchNamePattern matches the whole name, forgiving case and spacing", () => {
  const p = searchNamePattern("VC Returned (Regulars)");
  assert.ok(p.test("vc  returned (regulars) "));
  assert.ok(!p.test("VC Returned (Regulars) copy"));
  assert.ok(!p.test("VC Returned"));
});

test("checkSetting passes on a match, throws on a mismatch, warns when the dropdown is missing", () => {
  const settings = [
    { label: "Crosstab 1", selected: "2026: DNC Dem Party Support" },
    { label: "Column 1", selected: "Precinct" }
  ];
  assert.doesNotThrow(() => checkSetting(settings, "crosstab", "2026: DNC  Dem Party Support"));
  // Exact name only (ignoring case and spacing): a prefix, or a "v2" variant, is the wrong score.
  assert.throws(() => checkSetting(settings, "crosstab", "dem party support"), /not what this slot expects/);
  assert.throws(() => checkSetting([{ label: "Crosstab 1", selected: "2026: DNC Dem Party Support v2" }], "crosstab", "2026: DNC Dem Party Support"), /not what this slot expects/);
  assert.doesNotThrow(() => checkSetting(settings, "column", null));
  assert.throws(() => checkSetting(settings, "column", "County"), /not what this slot expects/);
  const warnings = [];
  checkSetting([], "column", "Precinct", (m) => warnings.push(m));
  assert.equal(warnings.length, 1);
});
