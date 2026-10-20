// Tests for the pure helpers in src/votebuilder.mjs (the browser-driving parts are not covered here).
import assert from "node:assert/strict";
import { test } from "node:test";
import { pickTemplate, newExports, exportIdFrom } from "../src/votebuilder.mjs";

test("pickTemplate matches a report by name, forgiving case and spacing, and returns null when absent", () => {
  const templates = [{ name: "[DATA] Canvass Results", link: "/x" }, { name: "Shifts  Today", link: "/y" }];
  assert.equal(pickTemplate(templates, "[DATA] Canvass Results").link, "/x");
  assert.equal(pickTemplate(templates, "shifts today").link, "/y");
  assert.equal(pickTemplate(templates, "canvass results"), null, "the [DATA] prefix is part of the name");
  assert.equal(pickTemplate(templates, "nope"), null);
});

test("exportIdFrom reads the export id from a download link", () => {
  assert.equal(exportIdFrom("ExportFileDownloadHandler.ashx?exportFileId=639000000000000001"), "639000000000000001");
});

test("newExports returns only the exports not already known, in listed order", () => {
  const fresh = newExports(["1"], [{ id: "1" }, { id: "3" }, { id: "2" }]);
  assert.deepEqual(fresh.map((r) => r.id), ["3", "2"]);
});
