import assert from "node:assert/strict";
import { test } from "node:test";
import { bandSumGap, isPlaceholderOption, looksLikeExportResponse, looksLikeVoterList, parseListCount, totalPeopleIn } from "../src/votebuilder.mjs";

const table = (rows) => Buffer.from(`<html><table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></html>`, "utf8");
const utf16 = (buf) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(buf.toString("utf8"), "utf16le")]);

test("totalPeopleIn reads the Total People column, not a trailing percent column", () => {
  const rows = [
    ["Precinct", "", "", "", "Total People"],
    ["", "0 to 9.99", "%", "90+", "%", ""],
    ["A - 001", "10", "50.0%", "10", "50.0%", "20"],
    ["Total People", "10", "50.0%", "10", "50.0%", "20", "100.0%"]
  ];
  assert.equal(totalPeopleIn(table(rows)), 20);
  assert.equal(totalPeopleIn(utf16(table(rows))), 20);
});

test("totalPeopleIn: VAN's real layout, a spanned header over the bands (regression, Oct 20)", () => {
  const html = Buffer.from(`<table>
    <tr class='thead'><th colspan="1" rowspan="2">Precinct</th><th colspan="11" rowspan="1">2026: DNC Dem Party Support</th><th colspan="1" rowspan="2">Total People</th></tr>
    <tr><th>0 to 9.99</th><th>10 to 19.99</th><th>20 to 29.99</th><th>30 to 39.99</th><th>40 to 49.99</th><th>50 to 59.99</th><th>60 to 69.99</th><th>70 to 79.99</th><th>80 to 89.99</th><th>90+</th><th>Unknown</th></tr>
    <tr><td>A - 001</td><td>1</td><td>31</td><td>9</td><td>13</td><td>19</td><td>5</td><td>4</td><td>18</td><td>24</td><td>28</td><td>0</td><td>152</td></tr>
    <tr><td>Total People</td><td>70</td><td>8,454</td><td>2,394</td><td>2,716</td><td>3,906</td><td>2,908</td><td>2,361</td><td>6,330</td><td>11,767</td><td>10,422</td><td>0</td><td>51,328</td></tr>
  </table>`, "utf8");
  assert.equal(totalPeopleIn(html), 51328);
  assert.equal(totalPeopleIn(utf16(html)), 51328);
  // Same, with a percent column after Total People: the header no longer matches the row width, so the last count wins.
  const pct = Buffer.from(html.toString("utf8").replace("<td>51,328</td></tr>", "<td>51,328</td><td>100.0%</td></tr>"), "utf8");
  assert.equal(totalPeopleIn(pct), 51328);
});

test("totalPeopleIn: plain layout, thousands separators, header row ignored, no totals row", () => {
  const rows = [["Precinct", "0 to 9.99", "90+", "Total People"], ["A - 001", "1", "2", "3"], ["Total People", "5,000", "2", "657,592"]];
  assert.equal(totalPeopleIn(table(rows)), 657592);
  assert.equal(totalPeopleIn(table(rows.slice(0, 2))), null);
  assert.equal(totalPeopleIn(Buffer.from("not a table")), null);
});

test("totalPeopleIn: a zero-person list has a Total People row of 0", () => {
  assert.equal(totalPeopleIn(table([["Precinct", "0 to 9.99", "Total People"], ["Total People", "0", "0"]])), 0);
});

test("parseListCount reads People and Person", () => {
  assert.equal(parseListCount("My List (51,328 People)"), 51328);
  assert.equal(parseListCount("My List (1 Person)"), 1);
  assert.equal(parseListCount("My List (0 People)"), 0);
  assert.equal(parseListCount("My List"), null);
});

test("isPlaceholderOption drops only placeholders, keeps folders whose names start with Select", () => {
  for (const t of ["-- Select --", "Select", "Select a folder", "---", "", "  Please select one "]) assert.equal(isPlaceholderOption(t), true, t);
  for (const t of ["Selected precincts", "Select Voters 2026", "Vote chaser", "Selects"]) assert.equal(isPlaceholderOption(t), false, t);
});

test("looksLikeExportResponse needs an attachment or a spreadsheet type, not a bare octet-stream", () => {
  assert.equal(looksLikeExportResponse({ "content-disposition": 'attachment; filename="DemographicsNew.xls"' }), true);
  assert.equal(looksLikeExportResponse({ "content-type": "application/vnd.ms-excel" }), true);
  assert.equal(looksLikeExportResponse({ "content-type": "text/csv" }), true);
  assert.equal(looksLikeExportResponse({ "content-type": "application/octet-stream" }), false);
  assert.equal(looksLikeExportResponse({ "content-type": "text/html" }), false);
});

test("looksLikeVoterList spots list views and leaves counts pages alone", () => {
  assert.equal(looksLikeVoterList("VANID  Name  Address"), true);
  assert.equal(looksLikeVoterList("First Name Last Name Phone"), true);
  assert.equal(looksLikeVoterList("Counts and Crosstabs  Precinct  Total People"), false);
});

test("bandSumGap spots a crosstab whose cells do not add up to its row totals (regression, Oct 20)", () => {
  const good = table([["Precinct", "", "Total People"], ["0 to 9.99", "90+", "Unknown"], ["A - 001", "1", "31", "0", "32"], ["A - 002", "5", "6", "0", "11"], ["Total People", "6", "37", "0", "43"]]);
  assert.deepEqual(bandSumGap(good), { rowsOff: 0, bands: 43, totals: 43 });
  const short = table([["Precinct", "", "Total People"], ["0 to 9.99", "90+", "Unknown"], ["A - 001", "1", "29", "0", "32"], ["A - 002", "5", "6", "0", "11"], ["Total People", "6", "35", "0", "43"]]);
  assert.deepEqual(bandSumGap(short), { rowsOff: 1, bands: 41, totals: 43 });
  assert.deepEqual(bandSumGap(utf16(short)), { rowsOff: 1, bands: 41, totals: 43 });
  // Percent columns are ignored, a zero-row file is fine.
  const pct = table([["Precinct", "", "", "", "Total People"], ["", "0 to 9.99", "%", "90+", "%", ""], ["A - 001", "10", "50.0%", "10", "50.0%", "20"], ["Total People", "10", "50.0%", "10", "50.0%", "20"]]);
  assert.equal(bandSumGap(pct).rowsOff, 0);
  assert.equal(bandSumGap(table([["Precinct", "0 to 9.99", "Total People"], ["Total People", "0", "0"]])).rowsOff, 0);
});
