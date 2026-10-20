// Run with `npm test`. The menu functions end to end against a strict fake of the Sheets API
// (test/fake-sheets.js), following the clicks a real tester made: Build sheet, Reset Setup, fill Setup,
// Build PTG tab (with many metrics), import shifts, paste survey pages, Run now, rebuild, clear.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadProject } = require('./fake-sheets.js');

const DIR = path.join(__dirname, '..');
const SHIFTS = ['VANID\tContact Name\tSignup Date\tStatus\tRole\tEvent Name\tEvent Type\tEvent Date\tShift Start Time\tShift End Time\tLocation Name\tRecruited By',
  '1\t"Doe, Test"\t2026-10-01\tCompleted\tVolunteer\tDaily_Canvass_Test\tCanvass\t2026-10-07\t2026-10-07 10:00:00.0000000 -04:00\t2026-10-07 13:00:00.0000000 -04:00\tOffice\tDoe, Jane',
  '1\t"Doe, Test"\t2026-10-01\tCompleted\tVolunteer\tDaily_Canvass_Test\tCanvass\t2026-10-07\t2026-10-07 14:00:00.0000000 -04:00\t2026-10-07 17:00:00.0000000 -04:00\tOffice\tDoe, Jane',
  '2\t"Roe, Test"\t2026-10-02\tScheduled\tVolunteer\tPhonebank_Test\tPhone Bank\t2026-10-21\t2026-10-21 18:00:00.0000000 -04:00\t2026-10-21 20:00:00.0000000 -04:00\tOffice\t',
  '3\t"Poe, Test"\t2026-10-02\tCompleted\tVolunteer\t[Cancelled] Old_Canvass\tCanvass\t2026-10-08\t2026-10-08 10:00:00.0000000 -04:00\t\tOffice\tDoe, Jane'].join('\n');
const SURVEY_HDR = 'VANID\tContact Name\tDate Canvassed\tSurvey Response\tSurvey Question Name\tCanvassed By\tIs Most Recent Response\tSurvey Response ID';
const SURVEY_P1 = [SURVEY_HDR, '1\t"Doe, Test"\t2026-10-06\tYes\t2026 Volunteer Ask\tDoe, Jane\tYes\ts1', '2\t"Roe, Test"\t2026-10-07\tNo\t2026 Volunteer Ask\tDoe, Jane\tYes\ts2'].join('\n');
const SURVEY_P2 = [SURVEY_HDR, '2\t"Roe, Test"\t2026-10-07\tNo\t2026 Volunteer Ask\tDoe, Jane\tYes\ts2', '3\t"Poe, Test"\t2026-10-14\tYes\t2026 Volunteer Ask\tSomeone Else\tYes\ts3'].join('\n');

function setupSheet(p) { return p.ss.getSheetByName('Setup'); }
/** Turn the grey Example rows into real rows, as a tester does: drop the "Example: " prefix. */
function useExamples(p) {
  const s = setupSheet(p);
  for (let r = 1; r <= s.getLastRow(); r++) { const v = s.get(r, 1); if (/^Example: /.test(String(v))) s.set(r, 1, String(v).replace(/^Example: /, '')); }
}
function cellWithValidation(sheet, r, c) { return sheet.validations[`${r},${c}`]; }
function findRow(sheet, text) { for (let r = 1; r <= sheet.getLastRow(); r++) for (let c = 1; c <= 8; c++) if (String(sheet.get(r, c)).trim() === text) return { r, c }; return null; }

test('Build sheet on a fresh copy: Start here first, Setup with notes and a bounded dropdown, no spill into Advanced', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  assert.deepEqual(p.ss.getSheets().map((s) => s.name).slice(0, 1), ['README: Start here']);
  const s = setupSheet(p);
  assert.ok(s.getLastRow() > 30);
  const hdr = findRow(s, 'What to count');
  assert.ok(cellWithValidation(s, hdr.r + 1, hdr.c), 'dropdown on the first metric row');
  const adv = findRow(s, 'Advanced');
  assert.equal(cellWithValidation(s, adv.r, 2), undefined, 'no dropdown on the Advanced hint cell');
  assert.equal(cellWithValidation(s, adv.r + 1, 2), undefined, 'no dropdown on Advanced rows before any import');
  const nv = findRow(s, 'Their name in VAN');
  assert.ok((s.notes[`${nv.r},${nv.c}`] || '').length > 20, 'hover note on a header');
  assert.match(p.ui.alerts.at(-1)[0], /Created README, Setup and log/);
});

test("Build sheet on a copy that already has Sam's Setup and README tabs leaves Setup alone and keeps the old README", () => {
  const p = loadProject(DIR);
  const old = p.ss.insertSheet('Setup'); old.getRange(1, 1, 2, 2).setValues([['Settings', ''], ['Campaign name', 'Old']]);
  const oldReadme = p.ss.insertSheet('README'); oldReadme.getRange(1, 1).setValue('old text');
  p.call('buildSheet');
  assert.equal(setupSheet(p).get(2, 2), 'Old');
  assert.ok(p.ss.getSheetByName('README (old)'), 'old README renamed, not deleted');
  assert.ok(p.ss.getSheetByName('README: Start here'));
  assert.match(p.ui.alerts.at(-1)[0], /Setup already exists.*Reset Setup/);
  p.call('resetSetup');
  assert.equal(setupSheet(p).get(1, 1), 'Settings');
  assert.notEqual(setupSheet(p).get(2, 2), 'Old');
  assert.equal(p.ss.getSheetByName('README (old)'), null, 'reset removes the old README tab');
});

test('the full flow: 9 metrics and 3 groups from the examples, build, import, paste twice, run, rebuild keeps goals, clear', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  useExamples(p);
  p.call('buildPtgTab');
  assert.match(p.ui.alerts.at(-1)[0], /PTG tab built for 4 weeks, 3 groups and 9 metrics/);
  const ptg = p.ss.getSheetByName('PTG');
  assert.ok(ptg.getMaxColumns() >= 6 + 9 * 5 - 1, 'tab grown to fit nine blocks plus the trailing spacer');
  assert.equal(ptg.frozenCols, 4);
  const colA = []; for (let r = 1; r <= ptg.getLastRow(); r++) colA.push(ptg.get(r, 1));
  assert.equal(colA.filter((v) => v === 'unassigned').length, 4, 'one Unassigned row per week');
  assert.equal(colA.filter((v) => v === 'group').length, 12);

  // goals survive a rebuild
  const firstGroupRow = colA.indexOf('group') + 1;
  ptg.set(firstGroupRow, 7, 50);
  p.call('buildPtgTab');
  assert.equal(p.ss.getSheetByName('PTG').get(firstGroupRow, 7), 50, 'goal kept across rebuild');

  // shifts import (tab-delimited "Excel" download) then two survey pastes, the second overlapping
  let msg = p.call('importExportText', SHIFTS, 'EventParticipantReport.xls');
  assert.match(msg, /Loaded 4 rows into "VAN shifts export"/);
  const s = setupSheet(p);
  const et = findRow(s, 'Only these event types');
  assert.equal(JSON.stringify(cellWithValidation(s, et.r + 1, et.c).values), JSON.stringify(['Canvass', 'Phone Bank']), 'event types offered from the import');
  const names = findRow(s, 'Their name in VAN');
  assert.equal(JSON.stringify(cellWithValidation(s, names.r + 1, names.c).values), JSON.stringify(['Doe, Jane;']), 'recruiter names offered, with the semicolon a Last, First name needs');
  msg = p.call('importExportText', SURVEY_P1, 'pasted rows');
  assert.match(msg, /Added 2 rows.*Survey Response ID/);
  msg = p.call('importExportText', SURVEY_P2, 'pasted rows');
  assert.match(msg, /Added 1 rows; 1 duplicates skipped; 3 rows in all/);
  const q = findRow(s, 'Which survey question');
  assert.equal(JSON.stringify(cellWithValidation(s, q.r + 1, q.c).values), JSON.stringify(['2026 Volunteer Ask']));
  const adv = findRow(s, 'Advanced');
  assert.equal(cellWithValidation(s, adv.r, 2), undefined, 'still no dropdown on the Advanced hint');
  assert.ok(cellWithValidation(s, adv.r + 1, 2), 'Advanced rows now offer headers');

  const summary = p.call('runFromDialog');
  assert.match(summary, /Dashboard: \d+ of \d+ cells for weeks that have started are linked to raw/, 'the self-check finds the dashboard keys in raw');
  assert.match(summary, /WARNING: no loaded responses are for the question\(s\) "2026 Leadership Ladder" \(Confirmed Leaders\)/, 'a stale example question warns instead of stopping the run');
  assert.match(summary, /2 completed shifts; 2 credited by "recruited by"/);
  assert.match(summary, /1 ignored at events starting with "\[Cancelled\]"/);
  assert.match(summary, /3 survey response rows/);
  const raw = p.ss.getSheetByName('raw');
  const rawRows = raw.getDataRange().getValues();
  assert.equal(rawRows[0][0], 'key');
  const val = (metric, group, week) => rawRows.find((r) => r[1] === metric && r[3] === group && r[5] === week)?.[6];
  assert.equal(typeof val('shifts_completed', 'jane_doe', 'Oct 5 - 11'), 'number', 'raw counts are numbers, not text');
  assert.equal(val('shifts_completed', 'jane_doe', 'Oct 5 - 11'), 2, 'two shifts, same person, same event, different start times');
  const ptgFormula = p.ss.getSheetByName('PTG').getDataRange().getValues().flat().find((x) => typeof x === 'string' && x.indexOf('=IFERROR(INDEX(raw!') === 0);
  assert.ok(ptgFormula, 'dashboard cells use INDEX/MATCH into raw');
  assert.equal(val('canvass_shifts', 'jane_doe', 'Oct 5 - 11'), 2);
  assert.equal(val('said_yes', 'jane_doe', 'Oct 5 - 11'), 1);
  assert.equal(val('said_yes', 'everyone_else', 'Oct 12 - 18'), 1, 'unlisted canvasser goes to the * group');
  assert.equal(val('volunteer_signups', 'jane_doe', 'Oct 5 - 11'), 2);

  p.call('clearImports');
  assert.equal(cellWithValidation(s, names.r + 1, names.c), undefined, 'clearing imports removes the offered name list');
  assert.throws(() => p.call('runFromDialog'), /but no (survey|shifts) data is loaded/);
});

test('wide and long imports grow the hidden tabs; a long program grows the raw tab', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  const s = setupSheet(p);
  // Setup: program from Aug 3, 10 groups, 9 metrics -> more than 1000 raw rows
  const sr = findRow(s, 'Program start date'); s.set(sr.r, 2, '2026-08-03');
  useExamples(p);
  const gh = findRow(s, 'Name on dashboard');
  for (let i = 0; i < 7; i++) { s.set(gh.r + 4 + i, 1, 'Extra ' + i); s.set(gh.r + 4 + i, 2, 'Extra, Person' + i + ';'); }
  // a Select-All style shifts export: 40 columns
  const extra = Array.from({ length: 28 }, (_, i) => 'Col' + i);
  const wide = SHIFTS.split('\n').map((l, i) => l + '\t' + extra.map((c) => (i === 0 ? c : 'x')).join('\t')).join('\n');
  assert.match(p.call('importExportText', wide, 'wide.xls'), /Loaded 4 rows/);
  assert.ok(p.ss.getSheetByName('VAN shifts export').getMaxColumns() >= 40);
  // a survey archive past 1000 rows, pasted in pages of 100
  for (let page = 0; page < 11; page++) {
    const rows = [SURVEY_HDR];
    for (let i = 0; i < 100; i++) { const n = page * 100 + i; rows.push(`${n}\tP\t2026-10-0${1 + (i % 7)}\tYes\t2026 Volunteer Ask\tDoe, Jane\tYes\tid${n}`); }
    p.call('importExportText', rows.join('\n'), 'pasted rows');
  }
  assert.ok(p.ss.getSheetByName('VAN survey export').getLastRow() > 1000);
  p.call('buildPtgTab');
  const summary = p.call('runFromDialog');
  assert.match(summary, /rows written/);
  assert.ok(p.ss.getSheetByName('raw').getLastRow() > 1000, 'raw tab grew past 1000 rows');
});

test('review fixes: event types with semicolons, serial dates, Unassigned name clash, header-like paste without VANID', () => {
  const C = require('../Config.js');
  const base = [['Settings'], ['Program start date', 46300], ['Election day', '2026-11-03'], [], ['Groups'], ['Name on dashboard'], ['A'], [], ['Metrics'], ['Column on dashboard', 'What to count', 'Only these event types'], ['Phones', 'Completed shifts', 'Phone Bank; Text Bank']];
  const pad = (rows) => rows.map((r) => { const x = r.slice(); while (x.length < 3) x.push(''); return x; });
  const cfg = C.parseSetup(pad(base), 'America/New_York');
  assert.equal(cfg.programStart, '2026-10-05', 'a serial number is read as the date it shows');
  assert.deepEqual(cfg.metrics[0].eventTypes, ['Phone Bank', 'Text Bank']);
  assert.throws(() => C.parseSetup(pad([['Settings'], ['Program start date', '2026-10-05'], ['Election day', '2026-11-03'], [], ['Groups'], ['Name on dashboard'], ['unassigned'], [], ['Metrics'], ['Column on dashboard', 'What to count'], ['S', 'Completed shifts']])), /clashes with the automatic Unassigned row/);
  const p = loadProject(DIR);
  p.call('buildSheet');
  assert.throws(() => p.call('importExportText', 'Contact Name\tEvent Name\tEvent Date\tStatus\nX\tE\t2026-10-07\tCompleted', 'noid.csv'), /has no VANID column/);
});

test('cells read back from a tab: Dates keep their time, time-only Dates become a time', () => {
  const p = loadProject(DIR);
  const D = require('vm').runInContext('Date', p.ctx);   // Dates from the script's own realm, as Sheets hands them back
  const cellText = (d) => p.call('cellText_', d, 'UTC');
  assert.equal(cellText(new D(D.UTC(2026, 9, 7))), '2026-10-07');
  assert.equal(cellText(new D(D.UTC(2026, 9, 7, 14, 0, 0))), '2026-10-07 14:00:00');
  assert.equal(cellText(new D(D.UTC(1899, 11, 30, 10, 0, 0))), '10:00:00');
  assert.equal(cellText('plain'), 'plain');
});

test('Build PTG tab with 1 metric and 1 group, and with 15 metrics and 10 groups', () => {
  for (const [nm, ng] of [[1, 1], [15, 10]]) {
    const p = loadProject(DIR);
    const s = p.ss.insertSheet('Setup');
    const rows = [['Settings'], ['Program start date', '2026-10-05'], ['Election day', '2026-11-03'], [], ['Groups'], ['Name on dashboard', 'Their name in VAN']];
    for (let i = 0; i < ng; i++) rows.push(['Group ' + i, 'Person ' + i]);
    rows.push([], ['Metrics'], ['Column on dashboard', 'What to count']);
    for (let i = 0; i < nm; i++) rows.push(['Metric ' + i, 'Completed shifts']);
    rows.forEach((r) => { while (r.length < 2) r.push(''); });
    s.getRange(1, 1, rows.length, 2).setValues(rows);
    p.call('buildSheet');
    p.call('buildPtgTab');
    assert.match(p.ui.alerts.at(-1)[0], new RegExp(`${ng} groups and ${nm} metrics`));
    const ptg = p.ss.getSheetByName('PTG');
    assert.equal(ptg.getLastRow(), 5 + 4 * (2 + ng + 1));
  }
});

test("Sam's old-style Setup still builds and runs", () => {
  const p = loadProject(DIR);
  const s = p.ss.insertSheet('Setup');
  const rows = [['Settings'], ['Campaign name', 'T'], ['Program start date', '2026-10-05'], ['Election day', '2026-11-03'], ['Week starts on', 'Monday'], ['Timezone', 'America/New_York'], ['Dashboard title', 'T'], ['Total row label', 'STATEWIDE'], [],
    ['Groups'], ['group_code', 'display_name', 'van_users', 'event_prefixes'], ['CMP-A', 'Dartmouth', 'jdoe, mlee', 'Daily_'], [],
    ['Metrics'], ['metric_key', 'label', 'type', 'value_column', 'date_column', 'canvasser_column', 'response_name'], ['shifts_complete', 'Shifts Completed', 'shifts_completed', '', '', '', ''], [],
    ['Columns', '(leave blank)'], ['Survey export: VanID column', '']];
  rows.forEach((r) => { while (r.length < 7) r.push(''); });
  s.getRange(1, 1, rows.length, 7).setValues(rows);
  p.call('buildSheet');
  p.call('buildPtgTab');
  assert.match(p.ui.alerts.at(-1)[0], /1 groups and 1 metrics/);
  p.call('importExportText', SHIFTS, 'x.xls');
  assert.match(p.call('runFromDialog'), /2 completed shifts/);
});

test('a pasted table with a blank first line still parses as tab-separated', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  const msg = p.call('importExportText', '\n\n' + SURVEY_P1, 'pasted rows');
  assert.match(msg, /Added 2 rows/);
});

test('a paste whose columns were not separated gets a message that shows what was seen', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  assert.throws(() => p.call('importExportText', 'VANID Contact Name Date Canvassed\n1 X 2026-10-07', 'pasted rows'), /No header row found.*First row seen: "VANID Contact Name Date Canvassed" \(1 cell in the row\)/);
});

test('running with survey columns but no survey data names the columns and says what to do', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  useExamples(p);
  p.call('buildPtgTab');
  p.call('importExportText', SHIFTS, 'x.xls');
  assert.throws(() => p.call('runFromDialog'), /Setup has survey columns \("Volunteer Signups", "Said Yes", "Confirmed Leaders"\) but no survey data is loaded.*Survey Response Report.*clear those rows/);
});

test('Run now rebuilds a dashboard that no longer matches Setup, keeping goals and imports', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  useExamples(p);
  p.call('buildPtgTab');
  p.call('importExportText', SHIFTS, 'x.xls');
  p.call('importExportText', SURVEY_P1, 'pasted rows');
  const ptg = p.ss.getSheetByName('PTG');
  const colA = []; for (let r = 1; r <= ptg.getLastRow(); r++) colA.push(ptg.get(r, 1));
  const firstGroupRow = colA.indexOf('group') + 1;
  ptg.set(firstGroupRow, 12, 40);                                  // a goal in the second block (Canvass Shifts)
  const s = setupSheet(p);
  const mh = findRow(s, 'Column on dashboard');
  s.set(mh.r + 1, 1, 'Renamed Column');                             // change Setup: first metric gets a new label (new key)
  const summary = p.call('runFromDialog');
  assert.match(summary, /Dashboard rebuilt to match Setup \(goals and imports kept\)/);
  assert.equal(p.ss.getSheetByName('PTG').get(1, 6), 'renamed_column', 'new key in row 1');
  assert.equal(p.ss.getSheetByName('PTG').get(firstGroupRow, 12), 40, 'the other block\'s goal survived');
  assert.ok(p.ss.getSheetByName('VAN shifts export').getLastRow() > 1, 'imports kept');
  assert.match(summary, /Dashboard: \d+ of \d+ cells/);
});

test('"*" group takes survey responses by unlisted canvassers; an answer on a first-response row warns', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  useExamples(p);
  const s = setupSheet(p);
  let sig = null; for (let r = 1; r <= s.getLastRow(); r++) if (s.get(r, 1) === 'Volunteer Signups') sig = r;
  s.set(sig, 5, 'Yes');                                             // "Which answer counts" on a first-response row: ignored, with a warning
  p.call('importExportText', SHIFTS, 'x.xls');
  p.call('importExportText', SURVEY_P2, 'pasted rows');            // includes a response by "Someone Else"
  const summary = p.call('runFromDialog');
  assert.match(summary, /WARNING: Setup row \d+, column E \("Which answer counts"\): "Yes" is ignored for "Volunteer Signups"/);
  const raw = p.ss.getSheetByName('raw').getDataRange().getValues();
  assert.equal(raw.filter((r) => r[1] === 'volunteer_signups' && r[3] === 'UNASSIGNED' && r[6] > 0).length, 0, 'the * group took the unlisted canvasser');
  assert.ok(raw.some((r) => r[1] === 'volunteer_signups' && r[3] === 'everyone_else' && r[6] > 0));
  assert.match(summary, /0 people whose canvasser is in no group/);
});

test('lower-is-better metrics: "Max" header, red rule on the percentage column', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  useExamples(p);
  p.call('buildPtgTab');
  const ptg = p.ss.getSheetByName('PTG');
  const row5 = []; for (let c = 1; c <= ptg.getLastColumn(); c++) row5.push(ptg.get(5, c));
  assert.ok(row5.includes('Max') && row5.includes('Goal'));
  const row4 = []; for (let c = 1; c <= ptg.getLastColumn(); c++) row4.push(ptg.get(4, c));
  assert.ok(row4.includes('No Shows (lower is better)'));
  assert.equal(ptg.cfRules.length, 2, 'one red-above and one green-at-or-below rule for the one lower-is-better metric');
});

test('a report the sheet does not know (Contact History) is refused, not filed as survey data', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  const ch = 'Voter File VANID\tContact Name\tDate Canvassed\tResult\tContact Type\tCanvassed By\n1\tX\t10/7/2026\tCanvassed\tWalk\tDoe, Jane';
  assert.throws(() => p.call('importExportText', ch, 'ContactHistoryReport.csv'), /does not look like a report the sheet knows.*Contact History, Activist Codes\) are not supported yet; nothing was imported/);
  assert.equal(p.ss.getSheetByName('VAN survey export'), null, 'nothing written');
});

test('warehouse mode: Run now leaves raw alone and only checks the dashboard; Short code fixes the metric key', () => {
  const p = loadProject(DIR);
  const s = p.ss.insertSheet('Setup');
  const rows = [['Settings'], ['Program start date', '2026-10-05'], ['Election day', '2026-11-03'], ['Raw tab is fed from outside', 'Yes'], [],
    ['Groups'], ['Name on dashboard', 'Short code (optional)'], ['Region One', 'R1'], [],
    ['Metrics'], ['Column on dashboard', 'What to count', 'Short code (optional)'], ['Doors Knocked', 'Fed from outside (warehouse writes raw)', 'doors'], ['Dials', 'warehouse', 'dials']];
  rows.forEach((r) => { while (r.length < 3) r.push(''); });
  s.getRange(1, 1, rows.length, 3).setValues(rows);
  p.call('buildSheet');
  p.call('buildPtgTab');
  assert.equal(p.ss.getSheetByName('PTG').get(1, 6), 'doors', 'the Short code is the metric key');
  // the warehouse writes raw in the contract's shape
  const raw = p.ss.insertSheet('raw');
  raw.getRange(1, 1, 3, 9).setValues([['key', 'metric_key', 'metric_label', 'group_code', 'week_start', 'week_label', 'value', 'run_timestamp', 'run_label'],
    ['Oct 5 - 11|R1|doors', 'doors', 'Doors Knocked', 'R1', '2026-10-05', 'Oct 5 - 11', 412, '2026-10-20 06:00', 'October 20 06:00'],
    ['Oct 5 - 11|UNASSIGNED|doors', 'doors', 'Doors Knocked', 'UNASSIGNED', '2026-10-05', 'Oct 5 - 11', 0, '2026-10-20 06:00', 'October 20 06:00']]);
  const summary = p.call('runFromDialog');
  assert.match(summary, /Raw tab is fed from outside: nothing was recounted. raw holds 2 rows/);
  assert.match(summary, /Dashboard: /);
  assert.equal(raw.get(2, 7), 412, 'raw untouched');
  p.call('checkDashboard');
  assert.match(p.ui.alerts.at(-1)[0], /Dashboard: /);
});

test('a single "Fed from outside" column keeps its raw rows while the rest are recounted', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  useExamples(p);
  const s = setupSheet(p);
  const mh = findRow(s, 'Column on dashboard');
  s.set(mh.r + 1, 1, 'Doors Knocked'); s.set(mh.r + 1, 2, 'Fed from outside (warehouse writes raw)'); s.set(mh.r + 1, 3, ''); s.set(mh.r + 1, 6, 'doors');
  p.call('importExportText', SHIFTS, 'x.xls');
  p.call('importExportText', SURVEY_P1, 'pasted rows');
  p.call('runFromDialog');
  const raw = p.ss.getSheetByName('raw');
  const n = raw.getLastRow();
  raw.getRange(n + 1, 1, 1, 9).setValues([['Oct 5 - 11|jane_doe|doors', 'doors', 'Doors Knocked', 'jane_doe', '2026-10-05', 'Oct 5 - 11', 77, 'x', 'x']]);
  const summary = p.call('runFromDialog');
  assert.match(summary, /Column "Doors Knocked" (is|are) fed from outside and were not recounted/);
  const kept = raw.getDataRange().getValues().find((r) => r[0] === 'Oct 5 - 11|jane_doe|doors');
  assert.equal(kept && kept[6], 77, 'the warehouse row survived the recount');
});

test('Show imported columns with nothing imported does not throw', () => {
  const p = loadProject(DIR);
  p.call('buildSheet');
  p.call('showImportedColumns');
  assert.match(p.ui.alerts.at(-1)[0], /nothing imported/);
});
