/**
 * Sheet.js — everything that reads or writes tabs.
 *
 * Tabs
 *   README   instructions for humans
 *   Setup    campaign config (read by Config.js) plus a Status block the runner updates
 *   log      one line per report per pass
 *   <tab>    one per report, replaced wholesale each pass
 */

var LOG_TAB = 'log', README_TAB = 'README';
var LOG_HEADER = ['Timestamp', 'Report', 'Database', 'Tab', 'Export File', 'Rows', 'Status', 'Details'];
var LOG_MAX_ROWS = 2000;
var STATUS_KEYS = ['Runner last seen', 'Last pass', 'Last pass result'];

/* ---------- replacing a report tab ---------- */

/**
 * Pure: given a tab's current size and the incoming block, which ranges to
 * clear and whether to grow. The grid only ever grows, because deleting rows
 * or columns breaks formulas in other tabs that point here. Tested in Node.
 * Ranges are {row, col, rows, cols}, 1-based, like getRange(r, c, nr, nc).
 */
function replacePlan(rowCount, columnCount, height, width) {
  var grow = (rowCount < height || columnCount < width)
    ? { rows: Math.max(0, height - rowCount), cols: Math.max(0, width - columnCount) }
    : null;
  var clears = [];
  if (rowCount > height) clears.push({ row: height + 1, col: 1, rows: rowCount - height, cols: Math.max(columnCount, width) });
  if (columnCount > width) clears.push({ row: 1, col: width + 1, rows: height, cols: columnCount - width });
  return { grow: grow, clears: clears };
}

/**
 * Replace a tab's values with `rows`, as Import → "Replace current sheet"
 * does. New values go in before leftovers are cleared, so the tab never
 * reads empty mid-sync. Formatting stays.
 */
function replaceTab_(title, rows) {
  var sheet = getOrCreate_(title);
  var width = rows.reduce(function (w, r) { return Math.max(w, r.length); }, 1); // a loop, since apply() overflows on big reports
  var height = Math.max(1, rows.length);
  var values = rows.length
    ? rows.map(function (r) { return r.concat(new Array(width - r.length).fill('')); })
    : [['']];
  var plan = replacePlan(sheet.getMaxRows(), sheet.getMaxColumns(), height, width);
  if (plan.grow) {
    if (plan.grow.rows) sheet.insertRowsAfter(sheet.getMaxRows(), plan.grow.rows);
    if (plan.grow.cols) sheet.insertColumnsAfter(sheet.getMaxColumns(), plan.grow.cols);
  }
  sheet.getRange(1, 1, height, width).setValues(values);
  plan.clears.forEach(function (c) { sheet.getRange(c.row, c.col, c.rows, c.cols).clearContent(); });
  return height;
}

/* ---------- log + status ---------- */

function log_(records) {
  var sheet = getOrCreate_(LOG_TAB);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOG_HEADER);
    sheet.setFrozenRows(1);
  }
  var rows = records.map(function (r) {
    return [r.timestamp || new Date(), r.report || '', r.database || '', r.tab || '', r.file || '', r.rows == null ? '' : r.rows, r.status || '', r.details || ''];
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LOG_HEADER.length).setValues(rows);
  if (sheet.getLastRow() > LOG_MAX_ROWS) sheet.deleteRows(2, 200);
}

/** Write a value next to a label in the Setup tab's Status block. */
function setStatus_(key, value) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SETUP_TAB);
  if (!sheet) return;
  var col = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim() === key) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
}

/* ---------- building the sheet ---------- */

function getOrCreate_(name) {
  var ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/** Create the Setup tab with sample values. Returns false if it already existed. */
function buildSetup_() {
  var ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName(SETUP_TAB)) return false;
  var sheet = ss.insertSheet(SETUP_TAB, 0);
  var rows = [
    ['Reports', '', '', ''],
    ['database', 'report_name', 'tab', 'enabled'],
    ['My Campaign', 'Shifts Recruited Today', 'shifts_recruited_today', 'yes'],
    ['My Campaign', 'Canvass Results', 'canvass_results', 'yes'],
    ['My Voters', 'Canvass Results Today', 'canvass_results_today', 'no']
  ].concat(blankRows_(11, 4)).concat([
    ['Settings (automatic runner only)', ''],
    ['Timezone', 'America/New_York'],
    ['Sync every (minutes)', 30],
    ['Active hours start (0-23)', 9],
    ['Active hours end (1-24)', 21],
    ['Export format (xls or csv)', 'xls'],
    ['', ''],
    ['Status (automatic runner only)', ''],
    ['Runner last seen', 'never'],
    ['Last pass', ''],
    ['Last pass result', '']
  ]);
  sheet.getRange(1, 1, rows.length, 4).setValues(rows.map(function (r) { return r.concat(['', '', '', '']).slice(0, 4); }));
  [1, 17, 24].forEach(function (r) { sheet.getRange(r, 1).setFontWeight('bold').setFontSize(12); });
  sheet.getRange(2, 1, 1, 4).setFontWeight('bold').setBackground('#f2f2f2');
  sheet.getRange(3, 1, 14, 4).setBackground('#fff2cc');
  sheet.getRange(18, 2, 5, 1).setBackground('#fff2cc');
  sheet.getRange(25, 2, 3, 1).setBackground('#efefef').setNote('Written by the automatic runner. Don\'t edit.');
  sheet.setColumnWidth(1, 240).setColumnWidth(2, 320).setColumnWidth(3, 220).setColumnWidth(4, 90);
  var dbRule = SpreadsheetApp.newDataValidation().requireValueInList(DATABASES, true).build();
  sheet.getRange(3, 1, 14, 1).setDataValidation(dbRule);
  var yesNo = SpreadsheetApp.newDataValidation().requireValueInList(['yes', 'no'], true).build();
  sheet.getRange(3, 4, 14, 1).setDataValidation(yesNo);
  return true;
}

function blankRows_(n, w) {
  var out = [];
  for (var i = 0; i < n; i++) out.push(new Array(w).fill(''));
  return out;
}

function buildReadme_() {
  var ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName(README_TAB)) return;
  var sheet = ss.insertSheet(README_TAB, 0);
  var lines = [
    ['Votebuilder Report Sync'],
    [''],
    ['Each Votebuilder report you upload lands in its own tab, replaced top to bottom. The log tab records every upload.'],
    [''],
    ['To update a report: in Votebuilder, open the saved report, Export As → Excel (.xls), download the zip from My Export Files,'],
    ['then here: Report Sync → Upload export…, drop the zip, pick the tab, Import.'],
    [''],
    ['The Reports table on Setup is a list of the reports you keep here; it fills the tab dropdown. The rest of Setup is for the'],
    ['optional automatic runner (see the docs), which does the export and upload for you on a schedule.'],
    [''],
    ['Full instructions: https://github.com/AI-Dems/ai-dems-gotv-tools/tree/main/tools/report-sync']
  ];
  sheet.getRange(1, 1, lines.length, 1).setValues(lines);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  sheet.setColumnWidth(1, 900);
}

// Node export for tests; ignored by Apps Script.
if (typeof module !== 'undefined') {
  module.exports = { replacePlan: replacePlan, LOG_HEADER: LOG_HEADER };
}
