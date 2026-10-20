import assert from "node:assert/strict";
import { test } from "node:test";
import { SLOTS, inHours, makeDataOptions, parseConfig, parseHours, parseSearches, slotFile } from "../src/config.mjs";
import { loadCredentials } from "../src/login.mjs";

const FOUR = {
  returned: "VC Returned",
  returned_regulars: "VC Returned Regulars",
  registered: "VC Registered",
  registered_regulars: "VC Registered Regulars"
};

test("slotFile names each slot the way the converter looks for it", () => {
  assert.deepEqual(SLOTS.map(slotFile), [
    "returned.xls",
    "returned_regulars.xls",
    "registered.xls",
    "registered_regulars.xls"
  ]);
  assert.throws(() => slotFile("returned_total"), /unknown slot/);
});

test("parseSearches accepts names or objects, top-level defaults, and the older expect* keys", () => {
  const s = parseSearches({ ...FOUR, crosstab: "2026: DNC Dem Party Support", registered: { search: " VC Registered ", crosstab: "Other Score" } });
  assert.deepEqual(s.returned, { slot: "returned", search: "VC Returned", crosstab: "2026: DNC Dem Party Support", column: "Precinct", expectCrosstab: "2026: DNC Dem Party Support", expectColumn: "Precinct" });
  assert.equal(s.registered.crosstab, "Other Score");
  assert.equal(parseSearches({ ...FOUR, returned: { search: "x", expectColumn: null } }).returned.column, null);
  assert.equal(parseSearches({ ...FOUR, returned: { search: "x", expectCrosstab: "Support" } }).returned.crosstab, "Support");
  assert.equal(parseSearches(FOUR).returned.crosstab, null);
});

test("parseSearches only needs the slots asked for, and rejects bad files", () => {
  assert.deepEqual(Object.keys(parseSearches({ returned: "A" }, ["returned"])), ["returned"]);
  assert.throws(() => parseSearches({ returned: "A" }), /no entry for "returned_regulars"/);
  assert.throws(() => parseSearches({ ...FOUR, returned: "  " }), /needs a saved search name/);
  assert.throws(() => parseSearches({ ...FOUR, extra: "x" }), /unknown slot/);
  assert.throws(() => parseSearches([]), /must be an object/);
  assert.throws(() => parseSearches(null), /must be an object/);
});

test("makeDataOptions maps slot files to makeData's option names, skipping missing slots", () => {
  assert.deepEqual(makeDataOptions({ registered: "o/registered.xls", returned: "o/returned.xls" }), { returned: "o/returned.xls", registered: "o/registered.xls" });
  assert.deepEqual(makeDataOptions({ returned_regulars: "r.xls", registered_regulars: "g.xls" }), { returnedRegulars: "r.xls", registeredRegulars: "g.xls" });
  assert.deepEqual(makeDataOptions({}), {});
});

test("parseConfig defaults to every slot, one pass, My Voters", () => {
  const c = parseConfig([], {});
  assert.deepEqual(c.slots, SLOTS);
  assert.equal(c.once, true);
  assert.equal(c.out, "exports");
  assert.equal(c.account.database, "My Voters");
  assert.equal(c.thenMakeData, false);
  assert.equal(c.dataOut, "../data.js");
  assert.equal(c.headed, false);
});

test("parseConfig handles --only, --every, VB_DATABASE and bad values", () => {
  assert.deepEqual(parseConfig(["--only", "registered", "--only", "returned"], {}).slots, ["returned", "registered"]);
  const loop = parseConfig(["--every", "30"], {});
  assert.deepEqual([loop.once, loop.everyMin], [false, 30]);
  assert.equal(parseConfig([], { VB_DATABASE: "Campaign" }).account.database, "My Campaign");
  assert.equal(parseConfig(["--account", "voters"], { VB_DATABASE: "campaign" }).account.name, "voters");
  assert.throws(() => parseConfig(["--only", "nope"], {}), /must be one of/);
  assert.throws(() => parseConfig(["--account", "x"], {}), /must be one of/);
  assert.throws(() => parseConfig([], { VB_DATABASE: "x" }), /VB_DATABASE/);
  assert.throws(() => parseConfig(["--once", "--every", "5"], {}), /either --once or --every/);
  assert.throws(() => parseConfig(["--every", "0"], {}), /minutes/);
  assert.throws(() => parseConfig(["--election-day", "Nov 3"], {}), /2026-11-03/);
  assert.equal(parseConfig(["--help"], {}).help, true);
});

test("parseHours and inHours", () => {
  const h = parseHours("9-21");
  assert.deepEqual(h, { start: 9, end: 21 });
  assert.equal(inHours(new Date(2026, 9, 9, 8, 59), h), false);
  assert.equal(inHours(new Date(2026, 9, 9, 9, 0), h), true);
  assert.equal(inHours(new Date(2026, 9, 9, 21, 0), h), false);
  assert.equal(inHours(new Date(2026, 9, 9, 23, 30), parseHours("0-24")), true);
  assert.throws(() => parseHours("21-9"));
});

test("loadCredentials reads the account's variables and needs both", () => {
  const account = { emailVar: "VB_EMAIL", passwordVar: "VB_PASSWORD" };
  assert.deepEqual(loadCredentials(account, { VB_EMAIL: " a@example.org ", VB_PASSWORD: "pw" }), { email: "a@example.org", password: "pw" });
  assert.equal(loadCredentials(account, { VB_EMAIL: "a@example.org" }), null);
});
