// Tests for Config.js: reading the Setup tab into a config object.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseSetup } = require('../Config.js');

// The layout the Build sheet step writes: a Reports table (header row plus 14
// slots), a Settings block and a Status block.
const SETUP_ROWS = [
  ['Reports', '', '', ''],
  ['database', 'report_name', 'tab', 'enabled'],
  ['My Campaign', 'Shifts Recruited Today', 'shifts_recruited_today', 'yes'],
  ['My Campaign', 'Canvass Results', 'canvass_results', ''],
  ['My Voters', 'Canvass Results Today', 'canvass_results_today', 'no']
]
  .concat(Array.from({ length: 11 }, () => ['', '', '', '']))
  .concat([
    ['Settings (automatic runner only)', '', '', ''],
    ['Timezone', 'America/Detroit', '', ''],
    ['Sync every (minutes)', 15, '', ''],
    ['Active hours start (0-23)', 9, '', ''],
    ['Active hours end (1-24)', 21, '', ''],
    ['Export format (xls or csv)', 'xls', '', ''],
    ['', '', '', ''],
    ['Status (automatic runner only)', '', '', ''],
    ['Runner last seen', 'never', '', ''],
    ['Last pass', '', '', ''],
    ['Last pass result', '', '', '']
  ]);

/** A copy of SETUP_ROWS with `mutate` applied, wrapped so assert.throws can call it. */
function broken(mutate) {
  const rows = SETUP_ROWS.map((r) => r.slice());
  mutate(rows);
  return () => parseSetup(rows);
}

test('parseSetup reads the layout Build sheet writes; a blank enabled cell means yes', () => {
  const cfg = parseSetup(SETUP_ROWS);
  assert.equal(cfg.timezone, 'America/Detroit');
  assert.equal(cfg.everyMin, 15);
  assert.deepEqual(cfg.hours, { start: 9, end: 21 });
  assert.deepEqual(
    cfg.reports.map((r) => [r.database, r.tab, r.enabled]),
    [
      ['My Campaign', 'shifts_recruited_today', true],
      ['My Campaign', 'canvass_results', true],
      ['My Voters', 'canvass_results_today', false]
    ]
  );
});

test('parseSetup rejects a reserved tab name', () => {
  assert.throws(broken((r) => { r[2][2] = 'log'; }), /reserved/);
});

test('parseSetup rejects two reports that target the same tab', () => {
  assert.throws(broken((r) => { r[3][2] = 'shifts_recruited_today'; }), /Two reports target/);
});

test('parseSetup rejects a database that is not one of the known two', () => {
  assert.throws(broken((r) => { r[2][0] = 'MyCampaign'; }), /database must be one of/);
});

test('parseSetup rejects a sync interval below 1 minute', () => {
  assert.throws(broken((r) => { r[18][1] = 0; }), /Sync every/);
});

test('parseSetup with only the Reports block falls back to defaults', () => {
  const cfg = parseSetup(SETUP_ROWS.slice(0, 5));
  assert.equal(cfg.everyMin, 30);
  assert.equal(cfg.timezone, 'America/New_York');
  assert.equal(cfg.format, 'xls');
});
