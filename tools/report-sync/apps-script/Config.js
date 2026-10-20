/**
 * Config.js — reads the Setup tab into a plain config object.
 *
 * The Setup tab has three blocks, each introduced by a bold label in column A:
 *   Reports    table: database | report_name | tab | enabled
 *   Settings   key/value pairs for the optional runner (A = label, B = value)
 *   Status     written by the optional runner; don't edit
 * A block ends at the first fully blank row. Order and row positions don't matter.
 * Uploads only need Reports (and only to fill the tab dropdown); the rest is
 * for the runner.
 */

var SETUP_TAB = 'Setup';
var DATABASES = ['My Campaign', 'My Voters'];
var RESERVED_TABS = ['Setup', 'README', 'log'];

var SETTINGS_KEYS = {
  'Timezone': 'timezone',
  'Sync every (minutes)': 'everyMin',
  'Active hours start (0-23)': 'hoursStart',
  'Active hours end (1-24)': 'hoursEnd',
  'Export format (xls or csv)': 'format'
};

function readConfig() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SETUP_TAB);
  if (!sheet) throw new Error('No "' + SETUP_TAB + '" tab. Run Report Sync → Build sheet first.');
  return parseSetup(sheet.getDataRange().getValues());
}

/** Pure: Setup tab values → config. Tested in Node. */
function parseSetup(values) {
  var blocks = splitBlocks_(values);
  var cfg = { reports: [] };
  (blocks.Settings || []).forEach(function (row) {
    var key = SETTINGS_KEYS[String(row[0]).trim()];
    if (key) cfg[key] = row[1];
  });
  cfg.timezone = String(cfg.timezone || 'America/New_York');
  cfg.everyMin = numberOr_(cfg.everyMin, 30);
  cfg.hours = { start: numberOr_(cfg.hoursStart, 9), end: numberOr_(cfg.hoursEnd, 21) };
  delete cfg.hoursStart; delete cfg.hoursEnd;
  cfg.format = String(cfg.format || 'xls').trim().toLowerCase();

  if (!(cfg.everyMin >= 1)) throw new Error('"Sync every (minutes)" on Setup must be 1 or more');
  if (!(cfg.hours.start >= 0 && cfg.hours.end <= 24 && cfg.hours.start < cfg.hours.end)) {
    throw new Error('Active hours on Setup must satisfy 0 ≤ start < end ≤ 24');
  }
  if (cfg.format !== 'xls' && cfg.format !== 'csv') throw new Error('Export format on Setup must be xls or csv');

  (blocks.Reports || []).slice(1).forEach(function (row, i) {
    if (!row[0] && !row[1] && !row[2]) return;
    var r = {
      database: String(row[0] || '').trim(),
      name: String(row[1] || '').trim(),
      tab: String(row[2] || '').trim(),
      enabled: isYes_(row[3])
    };
    var where = 'Reports row ' + (i + 1);
    if (DATABASES.indexOf(r.database) < 0) throw new Error(where + ': database must be one of ' + DATABASES.join(', '));
    if (!r.name) throw new Error(where + ': report_name is blank');
    if (!r.tab) throw new Error(where + ': tab is blank');
    if (RESERVED_TABS.indexOf(r.tab) >= 0) throw new Error(where + ': "' + r.tab + '" is a reserved tab name');
    cfg.reports.push(r);
  });
  var seen = {};
  cfg.reports.forEach(function (r) {
    if (seen[r.tab]) throw new Error('Two reports target the tab "' + r.tab + '"');
    seen[r.tab] = true;
  });
  return cfg;
}

/** Group rows by the block label that precedes them. */
function splitBlocks_(values) {
  var blocks = {}, current = null;
  values.forEach(function (row) {
    var a = String(row[0]).trim();
    var blank = row.every(function (c) { return c === '' || c == null; });
    if (blank) { current = null; return; }
    var label = a.replace(/\s*\(.*\)\s*$/, ''); // "Settings (automatic runner only)" → "Settings"
    if (!current && (label === 'Status' || label === 'Settings' || label === 'Reports')) { current = label; blocks[label] = []; return; }
    if (current) blocks[current].push(row);
  });
  return blocks;
}

function numberOr_(v, fallback) {
  return v === '' || v == null ? fallback : Number(v);
}

/** Blank, TRUE, "yes", "y", "1" all count as enabled; only an explicit no disables. */
function isYes_(v) {
  if (v === '' || v == null) return true;
  if (v === true) return true;
  if (v === false) return false;
  return /^(y|yes|true|1)$/i.test(String(v).trim());
}

// Node export for tests; ignored by Apps Script.
if (typeof module !== 'undefined') {
  module.exports = { parseSetup: parseSetup, DATABASES: DATABASES, RESERVED_TABS: RESERVED_TABS, SETTINGS_KEYS: SETTINGS_KEYS };
}
