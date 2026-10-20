import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnv, quoteEnv, renderEnv, renderSearches } from "../scripts/setup.mjs";
import { jobArgs, parseServiceArgs } from "../scripts/service.mjs";

test("setup writes quoted .env values that survive # and spaces, and reads them back", () => {
  const text = renderEnv({ VB_EMAIL: "a@b.org", VB_PASSWORD: "pa#ss word", VB_DATABASE: "voters" });
  assert.match(text, /VB_PASSWORD="pa#ss word"/);
  const back = parseEnv(text);
  assert.equal(back.VB_PASSWORD, "pa#ss word");
  assert.equal(back.VB_EMAIL, "a@b.org");
  assert.equal(quoteEnv('say "hi"'), `'say "hi"'`);
  assert.equal(parseEnv("X='a\"b'").X, 'a"b');
});

test("setup writes searches.json in the shape config.mjs reads", () => {
  const json = JSON.parse(renderSearches({ crosstab: "2026: DNC Dem Party Support", returned: "A", returned_regulars: "B", registered: "C", registered_regulars: "D" }));
  assert.deepEqual(json, { crosstab: "2026: DNC Dem Party Support", column: "Precinct", returned: "A", returned_regulars: "B", registered: "C", registered_regulars: "D" });
});

test("service parses its options and builds the daily job", () => {
  const o = parseServiceArgs(["install", "--at", "6:30", "--data-out", "/x/y/data.js"]);
  assert.equal(o.command, "install");
  assert.equal(o.hour, 6);
  assert.equal(o.minute, 30);
  assert.equal(o.account, "voters");
  assert.deepEqual(jobArgs(o), ["--env-file-if-exists=.env", "export.mjs", "--then-make-data", "--account", "voters", "--data-out", "/x/y/data.js"]);
  assert.equal(parseServiceArgs([]).command, "status");
  assert.throws(() => parseServiceArgs(["install", "--at", "25:00"]), /HH:MM/);
  assert.throws(() => parseServiceArgs(["install", "--account", "nope"]), /Unknown account/);
  assert.throws(() => parseServiceArgs(["dance"]), /Usage/);
});
