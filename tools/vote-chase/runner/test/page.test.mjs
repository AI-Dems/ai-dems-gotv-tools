/**
 * Tests of the page itself (../../index.html) in a real headless browser, through the
 * window.VoteChase API the page exposes. Fixtures are synthetic: no real precinct names.
 * Needs the Chromium that `npx playwright install chromium` provides; skipped if absent.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

// The page is copied into an empty temp folder first, so a data.js sitting next to the real
// index.html (a campaign's own counts) can never leak into, or steer, the tests.
const SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "index.html");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vcpage-"));
fs.copyFileSync(SOURCE, path.join(DIR, "index.html"));
const PAGE = pathToFileURL(path.join(DIR, "index.html")).href;

// A VAN-shaped crosstab as the page receives it after decoding: an HTML table with the
// header row, the band row (with percent columns), precinct rows and a Total People row.
const BANDS = ["0 to 9.99", "10 to 19.99", "20 to 29.99", "30 to 39.99", "40 to 49.99", "50 to 59.99", "60 to 69.99", "70 to 79.99", "80 to 89.99", "90+", "Unknown"];
function crosstab(rows, { percent = true } = {}) {
  const tr = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  const bandRow = ["", ...BANDS.flatMap((b) => (percent ? [b, "%"] : [b])), ""];
  const header = ["Precinct", ...bandRow.slice(1).map(() => ""), "Total People"];
  const body = rows.map(([name, counts]) => tr([name, ...counts.flatMap((c) => (percent ? [c, "0%"] : [c])), counts.reduce((a, b) => a + b, 0)]));
  const totals = BANDS.map((_, i) => rows.reduce((a, [, c]) => a + c[i], 0));
  const totalRow = tr(["Total People", ...totals.flatMap((c) => (percent ? [c, "0%"] : [c])), totals.reduce((a, b) => a + b, 0)]);
  return `<html><body><table>${tr(header)}${tr(bandRow)}${body.join("")}${totalRow}</table></body></html>`;
}
const P = ["County - Town A - 001", "County - Town A - 002", "County - Town B - 001"];
const REGISTERED = crosstab([[P[0], [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 50]], [P[1], [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 0]], [P[2], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20]]]);
const RETURNED = crosstab([[P[0], [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 10]], [P[1], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]]], { percent: false });

let browser;
try { browser = await chromium.launch(); } catch { browser = null; }

const withPage = async (fn) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(PAGE);
  await page.waitForFunction(() => window.VoteChase);
  try { return await fn(page, errors); } finally { await context.close(); }
};

test("the page parses VAN crosstabs and computes votes left per precinct", { skip: !browser && "no Chromium installed" }, async () => {
  await withPage(async (page, errors) => {
    const out = await page.evaluate(([reg, ret, names]) => {
      const VC = window.VoteChase;
      const r = VC.parseCountReport(reg); r.name = "registered.xls"; VC.setFile("registered", r);
      const t = VC.parseCountReport(ret); t.name = "returned.xls"; VC.setFile("returned", t);
      const S = VC.state(); S.basis = "all"; S.sort = "chase"; S.top = "all"; S.asof = "2026-10-19"; VC.render();
      const M = VC.compute();
      const row = (n) => M.rows.find((x) => x.name === n);
      return {
        bands: r.bands, vanTotal: r.vanTotalPeople, unmatched: r.unmatched,
        chase0: row(names[0]).chase, total0: row(names[0]).totalLeft, chase1: row(names[1]).chase, total2: row(names[2]).totalLeft,
        rows: document.querySelectorAll("#chaseTable tbody tr").length,
        headline: document.getElementById("headline").textContent,
        chip: document.getElementById("checksChip").textContent,
        checks: [...document.querySelectorAll("#checksList li")].map((li) => li.textContent.trim()),
        bar: !!document.querySelector("#chaseTable tbody tr .stack span"),
        stored: !!localStorage.getItem("votechase.v1")
      };
    }, [REGISTERED, RETURNED, P]);
    assert.deepEqual(errors, []);
    assert.deepEqual(out.bands, BANDS);
    assert.equal(out.vanTotal, 1170);
    assert.deepEqual(out.unmatched, []);
    // Default 5 buckets, chase = Strong D (80+), Lean D (60-79), Undecided (40-59): six bands × 50 left each.
    assert.equal(out.chase0, 300);
    assert.equal(out.total0, 500 + 40); // ten bands × 50 plus 40 unscored
    assert.equal(out.chase1, 54); // six chase bands × (10 − 1)
    assert.equal(out.total2, 20); // never voted; unscored only
    assert.equal(out.rows, 3);
    assert.match(out.headline, /354/);
    assert.equal(out.chip, "Checks: OK", JSON.stringify(out.checks));
    assert.ok(out.checks.every((c) => /^OK/.test(c)), JSON.stringify(out.checks));
    assert.equal(out.bar, true);
    assert.equal(out.stored, true);
  });
});

test("the page refuses voter lists and real workbooks, and keeps unrecognised band labels", { skip: !browser && "no Chromium installed" }, async () => {
  await withPage(async (page) => {
    const out = await page.evaluate(() => {
      const VC = window.VoteChase;
      const tryParse = (txt) => { try { VC.parseCountReport(txt); return "ok"; } catch (e) { return e.message; } };
      const odd = "<table><tr><td>Precinct</td><td></td><td></td><td>Total People</td></tr><tr><td></td><td>Low</td><td>90+</td><td></td></tr><tr><td>X - 001</td><td>1</td><td>2</td><td>3</td></tr></table>";
      return {
        voters: tryParse("<table><tr><td>VANID</td><td>First Name</td></tr><tr><td>1</td><td>a</td></tr><tr><td>2</td><td>b</td></tr></table>"),
        noPrecinct: tryParse("<table><tr><td>County</td><td>x</td></tr><tr><td>a</td><td>1</td></tr><tr><td>b</td><td>2</td></tr></table>"),
        unmatched: VC.parseCountReport(odd).unmatched
      };
    });
    assert.match(out.voters, /voter list/i);
    assert.match(out.noPrecinct, /precinct/i);
    assert.deepEqual(out.unmatched, ["Low"]);
  });
});

test("sample data loads, buckets can switch preset, and Reset clears storage", { skip: !browser && "no Chromium installed" }, async () => {
  await withPage(async (page, errors) => {
    page.on("dialog", (d) => d.accept());
    // The button sits inside collapsed <details>; click it the way a keyboard user would reach it.
    await page.evaluate(() => document.getElementById("sampleBtn").click());
    await page.waitForFunction(() => document.querySelectorAll("#chaseTable tbody tr").length > 0);
    const before = await page.evaluate(() => ({ rows: document.querySelectorAll("#chaseTable tbody tr").length, buckets: window.VoteChase.state().buckets.length }));
    assert.ok(before.rows > 0);
    assert.equal(before.buckets, 5);
    await page.evaluate(() => { const sel = document.getElementById("presetSel"); sel.value = "3"; sel.dispatchEvent(new Event("change")); });
    const after = await page.evaluate(() => window.VoteChase.state().buckets.length);
    assert.equal(after, 3);
    // Reset clears storage and reloads the page with ?reset=; wait for the reloaded page.
    await Promise.all([
      page.waitForNavigation({ waitUntil: "load" }),
      page.evaluate(() => document.getElementById("resetBtn").click())
    ]);
    await page.waitForFunction(() => window.VoteChase);
    const cleared = await page.evaluate(() => ({ stored: localStorage.getItem("votechase.v1"), rows: document.querySelectorAll("#chaseTable tbody tr").length }));
    assert.equal(cleared.stored, null);
    assert.equal(cleared.rows, 0);
    assert.deepEqual(errors, []);
  });
});

test.after(async () => { if (browser) await browser.close(); });
