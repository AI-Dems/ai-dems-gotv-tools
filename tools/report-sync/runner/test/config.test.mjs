// Tests for src/config.mjs: CLI arguments, .env validation and the Setup config the Sheet serves.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sheetConfig, inHours, loadSync, parseArgv } from "../src/config.mjs";

const RAW = {
  timezone: "America/Detroit",
  everyMin: 15,
  hours: { start: 9, end: 21 },
  format: "xls",
  reports: [
    { database: "My Campaign", name: "A", tab: "a", enabled: true },
    { database: "My Campaign", name: "B", tab: "b", enabled: false },
    { database: "My Voters", name: "C", tab: "c", enabled: true }
  ]
};

test("sheetConfig keeps only the account's database and enabled reports", () => {
  assert.deepEqual(sheetConfig(RAW, "My Campaign").reports, [{ name: "A", tab: "a" }]);
  assert.deepEqual(sheetConfig(RAW, "My Voters").reports, [{ name: "C", tab: "c" }]);
});

test("sheetConfig rejects an unknown timezone, a bad interval, bad hours and a bad format", () => {
  assert.throws(() => sheetConfig({ ...RAW, timezone: "Mars/Olympus" }, "My Campaign"), /unknown timezone/);
  assert.throws(() => sheetConfig({ ...RAW, everyMin: 0 }, "My Campaign"), /Sync every/);
  assert.throws(() => sheetConfig({ ...RAW, hours: { start: 21, end: 9 } }, "My Campaign"), /active hours/);
  assert.throws(() => sheetConfig({ ...RAW, format: "pdf" }, "My Campaign"), /must be xls or csv/);
});

test("inHours uses the Sheet's timezone, not the machine's", () => {
  const noonDetroit = new Date("2026-10-20T16:00:00Z");
  assert.equal(inHours(noonDetroit, { start: 9, end: 21 }, "America/Detroit"), true);
  assert.equal(inHours(noonDetroit, { start: 9, end: 21 }, "Asia/Tokyo"), false); // 01:00 in Tokyo
});

test("loadSync validates the web app URL shape and requires a token", () => {
  const url = "https://script.google.com/macros/s/ABC/exec";
  assert.throws(() => loadSync({ SYNC_URL: "https://docs.google.com/spreadsheets/d/x", SYNC_TOKEN: "t" }), /web app URL/);
  assert.throws(() => loadSync({ SYNC_URL: url, SYNC_TOKEN: "" }), /SYNC_TOKEN/);
  assert.deepEqual(loadSync({ SYNC_URL: url, SYNC_TOKEN: "t" }), { url, token: "t" });
});

test("parseArgv: --account, --once, default account, and unknown accounts are rejected", () => {
  assert.equal(parseArgv(["--account", "voters", "--once"]).account.database, "My Voters");
  assert.equal(parseArgv(["--account", "voters", "--once"]).once, true);
  assert.equal(parseArgv([]).account.name, "campaign");
  assert.equal(parseArgv(["--headed"]).headed, true);
  assert.throws(() => parseArgv(["--account", "dr1"]), /must be one of/);
});
