/**
 * Sheet.js — everything that reads or writes tabs.
 *
 * Tabs
 *   README  instructions for humans
 *   Setup   campaign config (read by Config.js)
 *   PTG     the dashboard; layout mirrors the original NH campus PTG
 *   raw     data feed, one row per week × group × metric (contract in docs/)
 *   log     one line per run
 */

var RAW_TAB = 'raw', PTG_TAB = 'PTG', LOG_TAB = 'log', README_TAB = 'README: Start here', OLD_README_TAB = 'README';
var RAW_HEADER = ['key', 'metric_key', 'metric_label', 'group_code', 'week_start', 'week_label', 'value', 'run_timestamp', 'run_label'];

// PTG grid geometry. Columns A-E are labels; metric blocks start at F.
var FIRST_METRIC_COL = 6;   // F
var BLOCK_WIDTH = 5;        // #, Goal, PTG, sparkline, spacer
var HEADER_ROWS = 5;        // keys, last-updated, title, metric labels, # / Goal / PTG

var COLORS = { header: '#1f3864', headerText: '#ffffff', week: '#d9e2f3', total: '#f2f2f2', bar: '#1a73e8', track: '#e8eaed', good: '#188038', bad: '#d93025' };

/* ---------- raw + log ---------- */

function writeRaw_(rows, runStamp, runLabel) {
  var sheet = getOrCreate_(RAW_TAB);
  sheet.clearContents();
  var values = [RAW_HEADER].concat(rows.map(function (r) {
    return [r.key, r.metric, r.label, r.group, r.weekStart, r.weekLabel, r.value, runStamp, runLabel];
  }));
  growTo_(sheet, values.length, RAW_HEADER.length);
  // Plain text for everything but the value, so week_start and the run stamps stay as the data contract writes
  // them (Sheets would turn them into dates). The value column stays a number: the dashboard sums it.
  sheet.getRange(1, 1, values.length, 6).setNumberFormat('@');
  sheet.getRange(1, 8, values.length, 2).setNumberFormat('@');
  sheet.getRange(1, 7, values.length, 1).setNumberFormat('0.##');   // whole numbers show plain; a sum such as 2.5 hours keeps its decimals
  sheet.getRange(1, 1, values.length, RAW_HEADER.length).setValues(values);
  sheet.hideSheet();
}

/**
 * After a run: do the dashboard's lookup keys (week label | group code | metric key, read from the PTG tab
 * itself) match what was just written to raw, and does a cell that should show a number show one?
 * Returns one sentence for the run summary; never throws.
 */
function dashboardCheck_(rawRows) {
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName(PTG_TAB);
    if (!sheet || sheet.getLastRow() <= HEADER_ROWS) return 'Dashboard: the PTG tab has not been built yet (PTG → Build PTG tab).';
    var v = sheet.getDataRange().getValues();
    var keys = v[0], week = '', wanted = [], cells = [];
    for (var r = HEADER_ROWS; r < v.length; r++) {
      if (!v[r][0] && v[r][2]) { week = String(v[r][2]); continue; }
      if (v[r][0] !== 'group' && v[r][0] !== 'unassigned') continue;
      for (var c = FIRST_METRIC_COL - 1; c < keys.length; c += BLOCK_WIDTH) {
        if (!keys[c]) continue;
        wanted.push(week + '|' + v[r][2] + '|' + keys[c]);
        cells.push({ row: r + 1, col: c + 1, key: week + '|' + v[r][2] + '|' + keys[c] });
      }
    }
    var have = {}; rawRows.forEach(function (x) { have[x.key] = x.value; });
    var matched = wanted.filter(function (k) { return have[k] !== undefined; }).length;
    if (!wanted.length) return 'Dashboard: no lookup cells found on the PTG tab; run PTG → Build PTG tab.';
    if (!matched) {
      var sampleRaw = rawRows.length ? rawRows[0].key : '(raw is empty)';
      return 'WARNING: none of the PTG tab\'s ' + wanted.length + ' cells match a raw row (dashboard key "' + wanted[0] + '" vs raw key "' + sampleRaw + '"). Setup changed since the dashboard was built: run PTG → Build PTG tab, then Run now again.';
    }
    // A cell that should show a positive number: does it?
    var probe = null;
    cells.forEach(function (cl) { if (!probe && have[cl.key] > 0) probe = cl; });
    if (probe) {
      var shown = sheet.getRange(probe.row, probe.col).getValue();
      if (shown === '-' || shown === '' || shown === null) return 'WARNING: raw has ' + have[probe.key] + ' for "' + probe.key + '" but the PTG cell shows "' + shown + '": the lookup formulas are not resolving. Run PTG → Build PTG tab to rewrite them; if it persists, check File → Settings → Locale (formulas use commas) and tell us.';
    }
    var started = wanted.filter(function (k) { return rawRows.some(function (x) { return x.weekLabel === k.split('|')[0]; }); }).length;
    return 'Dashboard: ' + matched + ' of ' + started + ' cells for weeks that have started are linked to raw' + (matched < started ? ' (' + (started - matched) + ' are not: run PTG → Build PTG tab)' : '') + '.';
  } catch (e) {
    return 'Dashboard check skipped: ' + e.message;
  }
}

/** The raw tab as row objects (the shape countHits produces), or [] when empty. */
function readRawRows_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(RAW_TAB);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getDataRange().getValues().slice(1).filter(function (r) { return r[0] !== '' && r[0] != null; }).map(function (r) {
    return { key: String(r[0]), metric: String(r[1]), label: String(r[2]), group: String(r[3]), weekStart: String(r[4]), weekLabel: String(r[5]), value: Number(r[6]) };
  });
}

/** Make sure a tab has at least `rows` rows and `cols` columns; a new tab has 1000 × 26 and getRange past that throws. */
function growTo_(sheet, rows, cols) {
  if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  if (sheet.getMaxColumns() < cols) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
}

function log_(status, message) {
  var sheet = getOrCreate_(LOG_TAB);
  if (sheet.getLastRow() === 0) sheet.appendRow(['time', 'status', 'message']).setFrozenRows(1);
  sheet.appendRow([new Date(), status, message]);
  // Newest run is the last row. Trim the oldest rows so the tab never grows forever.
  if (sheet.getLastRow() > 500) sheet.deleteRows(2, 100);
}

/* ---------- PTG dashboard ---------- */

/** Build (or rebuild) the PTG tab from config. Existing goals are preserved. */
function buildPtg_(cfg) {
  var sheet = getOrCreate_(PTG_TAB);
  var goals = readGoals_(sheet);
  sheet.setFrozenRows(0); sheet.setFrozenColumns(0);
  sheet.clear(); sheet.clearFormats(); sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();

  var lastCol = FIRST_METRIC_COL + cfg.metrics.length * BLOCK_WIDTH - 2; // no trailing spacer
  var grid = [], formats = [];
  var rowGroups = cfg.groups.concat([cfg.unassigned]);   // last row of each week: whatever no group claimed
  var rowsPerWeek = 2 + rowGroups.length;
  var totalRows = HEADER_ROWS + cfg.weeks.length * rowsPerWeek;
  // A new tab has 26 columns and 1000 rows; seven metric blocks need 39 columns. Grow the tab first or
  // getRange throws "Those columns are out of bounds".
  growTo_(sheet, totalRows, lastCol + 1);   // +1: formatPtg_ sizes the spacer after the last block
  for (var i = 0; i < totalRows; i++) grid.push(new Array(lastCol).fill(''));

  // Header rows (1-based rows: 1 keys, 2 last updated, 3 title, 4 labels, 5 # / Goal / PTG)
  grid[3][0] = 'metric_type'; grid[4][0] = 'metric_def';
  grid[1][FIRST_METRIC_COL - 1] = '="Last updated: "&IFERROR(INDEX(' + RAW_TAB + '!$I:$I,2),"never")';
  grid[2][FIRST_METRIC_COL - 1] = cfg.dashboardTitle;
  cfg.metrics.forEach(function (m, mi) {
    var c = FIRST_METRIC_COL - 1 + mi * BLOCK_WIDTH;
    grid[0][c] = m.key; grid[0][c + 1] = m.key + '_goal'; grid[0][c + 2] = 'ptg'; grid[0][c + 3] = 'sparkline';
    grid[3][c] = m.label + (isLowerBetter(m) ? ' (lower is better)' : '');
    grid[4][c] = '#'; grid[4][c + 1] = isLowerBetter(m) ? 'Max' : 'Goal'; grid[4][c + 2] = isLowerBetter(m) ? 'of max' : 'PTG';
  });

  // Week blocks
  cfg.weeks.forEach(function (w, wi) {
    var hdr = HEADER_ROWS + wi * rowsPerWeek;      // 0-based row index of the week header
    var tot = hdr + 1, g0 = tot + 1, gN = tot + rowGroups.length;
    grid[hdr][2] = w.label;
    grid[tot][0] = 'total'; grid[tot][2] = cfg.totalLabel;
    rowGroups.forEach(function (g, gi) {
      grid[g0 + gi][0] = g.code === cfg.unassigned.code ? 'unassigned' : 'group'; grid[g0 + gi][2] = g.code; grid[g0 + gi][3] = g.name;
    });
    cfg.metrics.forEach(function (m, mi) {
      var c = FIRST_METRIC_COL + mi * BLOCK_WIDTH;    // 1-based column of '#'
      var cnt = colLetter_(c), goal = colLetter_(c + 1);
      var r1 = g0 + 1, rN = gN + 1;                   // 1-based row numbers
      grid[tot][c - 1] = '=IF(ISNUMBER(' + cnt + r1 + '),SUM(' + cnt + r1 + ':' + cnt + rN + '),"-")';
      grid[tot][c] = '=SUM(' + goal + r1 + ':' + goal + rN + ')';
      grid[tot][c + 1] = ptgFormula_(cnt, goal, tot + 1);
      grid[tot][c + 2] = sparkFormula_(cnt, goal, tot + 1, isLowerBetter(m));
      rowGroups.forEach(function (g, gi) {
        var r = g0 + gi + 1;
        var key = '$C$' + (hdr + 1) + '&"|"&$C' + r + '&"|"&' + cnt + '$1';
        grid[r - 1][c - 1] = '=IFERROR(INDEX(' + RAW_TAB + '!$G:$G,MATCH(' + key + ',' + RAW_TAB + '!$A:$A,0)),"-")';
        if (g.code === cfg.unassigned.code) return;                    // no goal or PTG for the Unassigned row
        grid[r - 1][c] = goals[w.label + '|' + g.code + '|' + m.key] || '';
        grid[r - 1][c + 1] = ptgFormula_(cnt, goal, r);
        grid[r - 1][c + 2] = sparkFormula_(cnt, goal, r, isLowerBetter(m));
      });
    });
  });

  sheet.getRange(1, 1, totalRows, lastCol).setValues(grid);
  formatPtg_(sheet, cfg, totalRows, lastCol);
}

function ptgFormula_(cnt, goal, r) {
  return '=IF(OR(NOT(ISNUMBER(' + cnt + r + ')),N(' + goal + r + ')=0),"-",' + cnt + r + '/' + goal + r + ')';
}

function sparkFormula_(cnt, goal, r, lowerIsBetter) {
  // Lower-is-better: the bar fills toward the maximum and turns red once the count passes it.
  var color = lowerIsBetter ? 'IF(' + cnt + r + '>' + goal + r + ',"' + COLORS.bad + '","' + COLORS.good + '")' : '"' + COLORS.bar + '"';
  return '=IF(OR(NOT(ISNUMBER(' + cnt + r + ')),N(' + goal + r + ')=0),"",SPARKLINE({MIN(' + cnt + r + ',' + goal + r + '),MAX(' + goal + r + '-' + cnt + r + ',0)},{"charttype","bar";"max",MAX(' + goal + r + ',' + cnt + r + ');"color1",' + color + ';"color2","' + COLORS.track + '"}))';
}

function formatPtg_(sheet, cfg, totalRows, lastCol) {
  var rowsPerWeek = 3 + cfg.groups.length;   // header, total, groups, Unassigned
  sheet.getRange(1, 1, 1, lastCol).setFontColor('#999999').setFontSize(8);         // machine keys, visible but quiet
  sheet.getRange(2, FIRST_METRIC_COL, 1, lastCol - FIRST_METRIC_COL + 1).merge().setFontStyle('italic').setHorizontalAlignment('right');
  sheet.getRange(3, FIRST_METRIC_COL, 1, lastCol - FIRST_METRIC_COL + 1).merge().setFontSize(16).setFontWeight('bold').setHorizontalAlignment('center');
  cfg.metrics.forEach(function (m, mi) {
    var c = FIRST_METRIC_COL + mi * BLOCK_WIDTH;
    sheet.getRange(4, c, 1, 4).merge().setBackground(COLORS.header).setFontColor(COLORS.headerText).setFontWeight('bold').setHorizontalAlignment('center');
    sheet.getRange(5, c, 1, 2).setFontWeight('bold').setHorizontalAlignment('center');
    sheet.getRange(5, c + 2, 1, 2).merge().setFontWeight('bold').setHorizontalAlignment('center');
    sheet.getRange(6, c + 2, totalRows - 5, 1).setNumberFormat('0%');
    sheet.getRange(6, c + 1, totalRows - 5, 1).setBackground('#fffbe6');          // goal = hand-entered
    sheet.setColumnWidth(c + 3, 90); sheet.setColumnWidth(c + 4, 12);
  });
  for (var wi = 0; wi < cfg.weeks.length; wi++) {
    var hdr = HEADER_ROWS + 1 + wi * rowsPerWeek;
    // Merges must not cross the frozen-column boundary (D), so only C:D is merged.
    sheet.getRange(hdr, 3, 1, lastCol - 2).setBackground(COLORS.week).setFontWeight('bold');
    sheet.getRange(hdr, 3, 1, 2).merge();
    sheet.getRange(hdr + 1, 3, 1, lastCol - 2).setBackground(COLORS.total).setFontWeight('bold');
    sheet.getRange(hdr + 1, 3, 1, 2).merge();
    sheet.getRange(hdr + rowsPerWeek - 1, 3, 1, lastCol - 2).setFontStyle('italic').setFontColor('#5f6368');   // Unassigned row
    cfg.metrics.forEach(function (m, mi) { sheet.getRange(hdr + rowsPerWeek - 1, FIRST_METRIC_COL + mi * BLOCK_WIDTH + 1).setBackground(null); });   // no goal cell there
  }
  sheet.getRange(1, 1, totalRows, 2).setFontColor('#999999').setFontSize(8);
  sheet.setColumnWidth(1, 60); sheet.setColumnWidth(2, 30); sheet.setColumnWidth(3, 90); sheet.setColumnWidth(4, 140); sheet.setColumnWidth(5, 12);
  sheet.setFrozenRows(HEADER_ROWS); sheet.setFrozenColumns(4);
  sheet.getRange(1, FIRST_METRIC_COL, totalRows, lastCol - FIRST_METRIC_COL + 1).setHorizontalAlignment('center');
  // Lower-is-better columns: the percentage turns red once the count passes the maximum.
  var rules = [];
  cfg.metrics.forEach(function (m, mi) {
    if (!isLowerBetter(m)) return;
    var pct = sheet.getRange(HEADER_ROWS + 1, FIRST_METRIC_COL + mi * BLOCK_WIDTH + 2, totalRows - HEADER_ROWS, 1);
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(1).setFontColor(COLORS.bad).setBold(true).setRanges([pct]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThanOrEqualTo(1).setFontColor(COLORS.good).setRanges([pct]).build());
  });
  sheet.setConditionalFormatRules(rules);
}

/**
 * Does the PTG tab's layout still match Setup: same metric keys in row 1, same group codes, same weeks?
 * Used by Run now to rebuild the dashboard when Setup changed (goals are kept by the rebuild).
 */
function ptgMatchesConfig_(cfg) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(PTG_TAB);
  if (!sheet || sheet.getLastRow() <= HEADER_ROWS) return false;
  var v = sheet.getDataRange().getValues();
  var keys = [];
  for (var c = FIRST_METRIC_COL - 1; c < v[0].length; c += BLOCK_WIDTH) if (v[0][c]) keys.push(String(v[0][c]));
  if (keys.join('|') !== cfg.metrics.map(function (m) { return m.key; }).join('|')) return false;
  var weeks = [], codes = [];
  for (var r = HEADER_ROWS; r < v.length; r++) {
    if (!v[r][0] && v[r][2]) weeks.push(String(v[r][2]));
    else if (v[r][0] === 'group' || v[r][0] === 'unassigned') { if (weeks.length === 1) codes.push(String(v[r][2])); }
  }
  var wantCodes = cfg.groups.map(function (g) { return g.code; }).concat([cfg.unassigned.code]);
  return weeks.join('|') === cfg.weeks.map(function (w) { return w.label; }).join('|') && codes.join('|') === wantCodes.join('|');
}

/** Existing goals keyed 'week|group|metric', so a rebuild never loses hand-entered numbers. */
function readGoals_(sheet) {
  var goals = {};
  if (sheet.getLastRow() < HEADER_ROWS) return goals;
  var v = sheet.getDataRange().getValues();
  var keys = v[0], week = '';
  for (var r = HEADER_ROWS; r < v.length; r++) {
    if (!v[r][0] && v[r][2]) { week = v[r][2]; continue; }       // week header row
    if (v[r][0] !== 'group') continue;
    for (var c = FIRST_METRIC_COL - 1; c < keys.length; c++) {
      if (/_goal$/.test(String(keys[c])) && v[r][c] !== '') goals[week + '|' + v[r][2] + '|' + String(keys[c]).replace(/_goal$/, '')] = v[r][c];
    }
  }
  return goals;
}

/* ---------- Setup + README scaffolding ---------- */

function buildSetup_() {
  var sheet = getOrCreate_(SETUP_TAB);
  if (sheet.getLastRow() > 0) return false;   // never overwrite a filled-in Setup
  var W = 8;
  var rows = [
    ['Settings', 'Dates and labels. Hover any bold label or column header for what goes there.'],
    ['Campaign name', 'My Campaign'],
    ['Program start date', '2026-10-05'],
    ['Election day', '2026-11-03'],
    ['Week starts on', 'Monday'],
    ['Timezone', 'America/New_York'],
    ['Dashboard title', 'Progress to Goals'],
    ['Total row label', 'TOTAL'],
    ['Unassigned row label', 'Unassigned'],
    ['Ignore events starting with', '[Cancelled]'],
    ['Raw tab is fed from outside', 'No'],
    [],
    ['Groups', 'One row per person, team or turf you want a row for. Replace the examples; rows starting with "Example" are ignored. Need more rows? Right-click a row number → Insert 1 row above.'],
    ['Name on dashboard', 'Their name in VAN', 'Or events starting with', 'Short code (optional)'],
    ['Example: Jane Doe', 'Doe, Jane;', '', ''],
    ['Example: Campus team', 'Smith, Pat; Chris Park; jdoe', 'CMPA_', ''],
    ['Example: Everyone else', '', '*', ''],
    [], [], [], [], [], [], [], [],
    ['Metrics', 'One row per column on the dashboard. Replace the examples; rows starting with "Example" are ignored. Shift choices need the Event Participant Report imported; survey choices need the Survey Response Report. Need more rows? Right-click a row number → Insert 1 row above.'],
    ['Column on dashboard', 'What to count', 'Only these event types', 'Which survey question', 'Which answer counts', 'Short code (optional)'],
    ['Example: Shifts Completed', TYPE_PHRASES.shifts_completed, '', '', ''],
    ['Example: Canvass Shifts', TYPE_PHRASES.shifts_completed, 'Canvass', '', ''],
    ['Example: Phone Bank Shifts', TYPE_PHRASES.shifts_completed, 'Phone Bank', '', ''],
    ['Example: Shifts Scheduled', TYPE_PHRASES.shifts_scheduled, '', '', ''],
    ['Example: No Shows', TYPE_PHRASES.shifts_flaked, '', '', ''],
    ['Example: Active Volunteers', TYPE_PHRASES.active_volunteers, '', '', ''],
    ['Example: Volunteer Signups', TYPE_PHRASES.survey_first_response, '', '2026 Volunteer Ask', ''],
    ['Example: Said Yes', TYPE_PHRASES.survey_current_response, '', '2026 Volunteer Ask', 'Yes'],
    ['Example: Confirmed Leaders', TYPE_PHRASES.survey_current_response, '', '2026 Leadership Ladder', '4 - Confirmed'],
    [], [], [], [], [], [], [], [],
    ['Advanced', 'Leave blank. Fill a row only if a run says a column is missing; after an import each cell offers the headers found. (If your survey export is one row per person rather than the Survey Response Report, add two columns to the Metrics table headed "Date column (advanced)" and "Canvasser column (advanced)"; see the Start here tab.)'],
    ['Survey export: VanID column', ''],
    ['Survey export: question name column (optional)', ''],
    ['Survey export: response column (optional)', ''],
    ['Survey export: date column (optional)', ''],
    ['Survey export: canvasser column (optional)', ''],
    ['Survey export: most-recent flag column (optional)', ''],
    ['Survey export: response id column (optional)', ''],
    ['Shifts export: VanID column', ''],
    ['Shifts export: event name column', ''],
    ['Shifts export: event date column', ''],
    ['Shifts export: status column', ''],
    ['Shifts export: shift column (optional)', ''],
    ['Shifts export: credit column (optional)', ''],
    ['Shifts export: event type column (optional)', ''],
    ['Shifts export: organizer column (optional)', '']
  ];
  rows.forEach(function (r) { while (r.length < W) r.push(''); });
  growTo_(sheet, rows.length, W);
  sheet.getRange(1, 1, rows.length, W).setNumberFormat('@');   // before the values: otherwise Sheets turns the sample dates into dates
  sheet.getRange(1, 1, rows.length, W).setValues(rows);
  formatSetup_(sheet, rows, W);
  addSetupNotes_(sheet, rows);
  addSetupDropdowns_(sheet, rows);
  return true;
}

/** Titles bold, table headers shaded, hints italic grey, example rows grey italic, key/value labels bold. */
function formatSetup_(sheet, rows, W) {
  var tables = ['Groups', 'Metrics'];
  rows.forEach(function (r, i) {
    var row = i + 1, a = String(r[0]);
    if (BLOCK_TITLES.indexOf(a) >= 0) {
      sheet.getRange(row, 1).setFontWeight('bold').setFontSize(12);
      sheet.getRange(row, 2).setFontStyle('italic').setFontColor('#5f6368');
      return;
    }
    if (i > 0 && tables.indexOf(String(rows[i - 1][0])) >= 0) { sheet.getRange(row, 1, 1, W).setFontWeight('bold').setBackground(COLORS.week); return; }
    if (EXAMPLE_ROW.test(a)) { sheet.getRange(row, 1, 1, W).setFontStyle('italic').setFontColor('#80868b'); return; }
    if (a && String(r[2] || '') === '') sheet.getRange(row, 1).setFontWeight('bold');   // Settings and Advanced labels
  });
  sheet.setColumnWidth(1, 300); sheet.setColumnWidth(2, 300);
  for (var c = 3; c <= W; c++) sheet.setColumnWidth(c, 200);
}

/** Hover notes: what to type, whether it can be blank, and whether it must match something in the export. */
function addSetupNotes_(sheet, rows) {
  var notes = {
    'Campaign name': 'Anything. Required. Used in messages.',
    'Program start date': 'yyyy-mm-dd. Required. Snapped back to the start of its week; nothing before that day counts.',
    'Election day': 'yyyy-mm-dd. Required. The last week runs through this day.',
    'Week starts on': 'Day name. Default Monday.',
    'Timezone': 'e.g. America/New_York. Only stamps "Last updated".',
    'Dashboard title': 'Anything. Optional. The big title on the PTG tab.',
    'Total row label': 'Anything. Optional (TOTAL). The first row of each week.',
    'Unassigned row label': 'Anything. Optional (Unassigned). The last row of each week: whatever no group claimed.',
    'Ignore events starting with': 'Starts of event names to skip, comma-separated. Optional (default [Cancelled]). Type none to skip nothing.',
    'Raw tab is fed from outside': 'Yes only if a data warehouse (BigQuery, Civis, Portal) writes the hidden raw tab itself. Then Run now recounts nothing and only checks that the dashboard can read raw. Default No.',
    'Name on dashboard': 'YOU MAKE IT UP. Required. The row label people read: a person, team or turf.',
    'Their name in VAN': 'MUST MATCH YOUR EXPORT. Optional. The people whose work counts here, written as VAN writes them in Recruited By / Canvassed By (or in a DCCC Organizer column, used when Recruited By is blank): "Jane Doe" or "Doe, Jane;" (end with a semicolon, or separate several people with semicolons); usernames "jdoe, mlee". Word order and case are ignored. After an import this cell offers the names found.',
    'Or events starting with': 'MUST MATCH YOUR EXPORT. Optional. Starts of event names (CMPA_) whose shifts count here when no listed person recruited them. * = everything no other group claimed: every such shift and every survey response by an unlisted canvasser.',
    'Short code (optional)': 'Optional. A short key for the raw tab and formulas; made from the name when blank.',
    'Column on dashboard': 'YOU MAKE IT UP. Required. The column heading people read. Goals are tied to the Short code, which is made from this name unless you fill it in; so renaming a column later loses its goals unless the Short code is set.',
    'Short code (optional)': 'Optional. The key used in the raw tab and formulas (letters, digits, underscores). Made from the column name when blank. Set it if you plan to rename columns, or if a warehouse writes raw and needs a known metric_key.',
    'What to count': 'PICK FROM THE DROPDOWN. Required. The tool\'s counting rule, not a VAN value. The five shift choices need the Event Participant Report imported; the two survey choices need the Survey Response Report imported or pasted. "Fed from outside" means a warehouse writes this column\'s rows into raw and the sheet leaves them alone. A run stops if a column\'s data is not loaded, and says which rows to clear.',
    'Which survey question': 'MUST MATCH YOUR EXPORT. Required for the two survey choices, blank for shifts. The question\'s name exactly as VAN shows it (e.g. 2026 Rivet Vol). After an import this cell offers the questions found.',
    'Which answer counts': 'MUST MATCH YOUR EXPORT. Required for "People whose current answer is…". The answer (e.g. Yes, or 4 - Confirmed), several separated by semicolons, or * for any answer. After an import this cell offers the answers found.',
    'Only these event types': 'MUST MATCH YOUR EXPORT. Optional, shifts only. Event Type values to count, several separated by commas or semicolons (Canvass, Phone Bank). Blank = all events. After an import this cell offers the types found.',
    'Date column (advanced)': 'Only for a per-person list export (not the Survey Response Report): the header of the column with the date the answer was recorded. Otherwise blank.',
    'Canvasser column (advanced)': 'Only for a per-person list export: the header of the column with who recorded the answer. Otherwise blank.',
    'Advanced': 'MUST MATCH HEADERS in your exports. Leave blank unless a run says a column is missing.'
  };
  rows.forEach(function (r, i) {
    r.forEach(function (cell, j) {
      var n = notes[String(cell)];
      if (n) sheet.getRange(i + 1, j + 1).setNote(n);
    });
  });
}

/**
 * How many rows belong to the table whose header is on `headerRow`: everything down to the row before the
 * next block title (or the end). Dropdowns are applied to exactly these rows, so they never spill into the
 * next block. Rows inserted inside the table inherit the dropdown from the row above.
 */
function tableRowCount_(rows, headerRow) {
  var n = 0;
  for (var i = headerRow; i < rows.length; i++) {   // rows is 0-based; headerRow is 1-based, so this starts at the row after the header
    if (BLOCK_TITLES.indexOf(String(rows[i][0]).trim()) >= 0) break;
    n++;
  }
  return Math.max(n, 1);
}

/** Dropdowns that need no import: the counting rules, the day of the week, the timezone. */
function addSetupDropdowns_(sheet, rows) {
  var at = findCell_(rows, 'What to count');
  if (at) setListValidation_(sheet, at.row + 1, at.col, tableRowCount_(rows, at.row), typePhrases_(), 'Pick what this column counts.');
  var day = findCell_(rows, 'Week starts on');
  if (day) setListValidation_(sheet, day.row, 2, 1, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], '');
  var tz = findCell_(rows, 'Timezone');
  if (tz) setListValidation_(sheet, tz.row, 2, 1, ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'], 'Other zones can be typed.');
}

/**
 * After an import: offer the values actually found in the exports as dropdowns on Setup (typing anything
 * else still works). Questions and answers from the survey tab; event types and recruiter/canvasser names
 * from both tabs; export headers for the Advanced rows. Never throws: Setup may be in any state.
 */
function refreshSetupDropdowns_() {
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName(SETUP_TAB);
    if (!sheet || sheet.getLastRow() < 1) return;
    var rows = sheet.getDataRange().getValues();
    var survey = readImportTab_(SURVEY_TAB), shifts = readImportTab_(SHIFTS_TAB);
    var cols = {};
    try { cols = readConfig().columns; } catch (e) { /* Setup incomplete; auto-detect only */ }
    var distinct = function (tab, key) {
      if (!tab || !key) return [];
      var seen = {};
      tab.records.forEach(function (r) { var v = String(r[key] == null ? '' : r[key]).trim(); if (v) seen[v] = true; });
      return Object.keys(seen).sort();
    };
    var pick = function (tab, configured, candidates) { return tab ? resolveColumn(tab.header, configured, candidates) : null; };
    var questions = distinct(survey, pick(survey, cols.surveyQuestion, COLUMN_CANDIDATES.surveyQuestion));
    var answers = distinct(survey, pick(survey, cols.surveyResponse, COLUMN_CANDIDATES.surveyResponse));
    var types = distinct(shifts, pick(shifts, cols.shiftEventType, COLUMN_CANDIDATES.shiftEventType));
    var people = distinct(shifts, pick(shifts, cols.shiftCredit, COLUMN_CANDIDATES.shiftCredit)).concat(distinct(survey, pick(survey, cols.surveyCanvasser, COLUMN_CANDIDATES.surveyCanvasser)));
    people = people.filter(function (p, i) { return people.indexOf(p) === i; }).sort();
    var offer = function (header, values, hint) {
      var at = findCell_(rows, header);
      if (!at) return;
      var range = sheet.getRange(at.row + 1, at.col, tableRowCount_(rows, at.row), 1);
      if (values.length) setListValidation_(sheet, at.row + 1, at.col, tableRowCount_(rows, at.row), values.slice(0, 500), hint);
      else range.clearDataValidations();                                  // nothing imported (or cleared): no list to offer
    };
    offer('Which survey question', questions, 'Questions found in your survey import. Typing another name also works.');
    offer('Which answer counts', answers, 'Answers found in your survey import. Several: separate with semicolons. * = any.');
    offer('Only these event types', types, 'Event types found in your shifts import. Several: separate with commas.');
    // A name written "Last, First" needs a trailing semicolon so it is read as one person.
    offer('Their name in VAN', people.map(function (n) { return n.indexOf(',') >= 0 ? n + ';' : n; }), 'Names found in Recruited By / Canvassed By. Several: separate with semicolons.');
    var surveyHeaders = survey ? survey.header.slice().sort() : [], shiftHeaders = shifts ? shifts.header.slice().sort() : [];
    rows.forEach(function (r, i) {
      var label = String(r[0]);
      if (!COLUMN_KEYS[label]) return;
      var list = label.indexOf('Survey export') === 0 ? surveyHeaders : shiftHeaders;
      if (list.length) setListValidation_(sheet, i + 1, 2, 1, list, 'Headers found in that import.');
      else sheet.getRange(i + 1, 2).clearDataValidations();
    });
  } catch (e) {
    log_('info', 'Setup dropdowns not refreshed: ' + e.message);
  }
}

function findCell_(rows, text) {
  for (var i = 0; i < rows.length; i++) for (var j = 0; j < rows[i].length; j++) if (String(rows[i][j]).trim() === text) return { row: i + 1, col: j + 1 };
  return null;
}

function setListValidation_(sheet, row, col, numRows, values, help) {
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true);
  if (help) rule.setHelpText(help);
  sheet.getRange(row, col, numRows, 1).setDataValidation(rule.build());
}

function buildReadme_() {
  var sheet = getOrCreate_(README_TAB);
  if (sheet.getLastRow() > 0) return;
  var lines = [
    ['Progress to Goals (PTG) tracker: start here'],
    ['This sheet turns VAN exports into each organizer\'s or team\'s weekly numbers against the goals you type in. You never need the GitHub docs to use it; everything is on this tab and in the hover notes on Setup.'],
    [''],
    ['STEP 1. Fill in the Setup tab (10 minutes)'],
    ['• Settings: your program start date and election day. The rest can stay as it is.'],
    ['• Groups: one row per person, team or turf you want a row for. "Their name in VAN" is how VAN writes them in Recruited By / Canvassed By (e.g. "Doe, Jane;"). A row with * under "Or events starting with" takes every shift and every survey response that no listed person accounts for. Delete or overwrite the grey Example rows; they are ignored.'],
    ['• Metrics: one row per column you want. Pick "What to count" from the dropdown. The five shift choices are fed by the Event Participant Report (Step 3); the two survey choices by the Survey Response Report (Step 4), so only add survey columns if you will import that report. For the survey choices, type the survey question\'s name as VAN shows it; for "current answer is…", the answer that counts (Yes). "Only these event types" narrows a shift column to Canvass, Phone Bank, etc.'],
    ['• Have a data warehouse (BigQuery, Civis, Portal)? Set "Raw tab is fed from outside" to Yes and write the hidden raw tab yourself in the shape docs/data-contract.md describes; PTG → Check dashboard against raw tells you whether every cell finds its row. A single column can also be marked "Fed from outside" while the rest come from VAN exports.'],
    ['• Advanced: leave blank. (Only if your survey export is one row per person instead of the Survey Response Report: add two columns to the Metrics table headed "Date column (advanced)" and "Canvasser column (advanced)" holding that question\'s date and canvasser headers, and put the answer column\'s header under "Which survey question".)'],
    ['Hover any bold label or column header on Setup for what goes there, whether it can be blank, and whether it must match your export.'],
    [''],
    ['STEP 2. PTG menu → Build PTG tab. Type goals into the yellow cells.'],
    ['If you change Groups or Metrics later, just click Run now: the dashboard is rebuilt to match Setup, and your goals and imported data are kept (goals are tied to the column name and the row name). For "No-shows", the yellow cell is a maximum, and the column turns red past it.'],
    [''],
    ['STEP 3. Get shifts from VAN (MyCampaign)'],
    ['• Make a list of everyone with an event signup (Create a New List → Events, any status) and run it.'],
    ['• Reports → Event Participant Report. Set the event date range from your program start through election day.'],
    ['• The report\'s default columns are all the sheet needs (VANID, Event Name, Event Date, Status, Shift Start Time, Event Type, Recruited By); you don\'t need Select All, which only adds personal data. Export As… → Excel. The file is called EventParticipantReport-….xls. CSV also works.'],
    [''],
    ['STEP 4. Get survey responses from VAN (only if you track survey columns)'],
    ['• Make a list of everyone who answered your volunteer question (Create a New List → Survey Questions → that question → any response) and run it.'],
    ['• Reports → Survey Response Report. Set Date Canvassed from your program start through today (the report allows 30 days per pull; for a longer program pull the older window once, then the recent window each day).'],
    ['• Edit Columns: make sure Survey Response, Survey Question Name, Date Canvassed, Canvassed By, Is Most Recent Response and Survey Response ID are ticked (Select All is the quick way). Export As… → Excel if the button is there.'],
    ['• No Export button? Your committee hasn\'t enabled it for your login (ask your VAN admin, usually at the state party). Meanwhile: select the table on the page, copy, and paste it into the import dialog (Step 5), one page of 100 rows at a time. Repeated headers and duplicate rows are skipped, so pasting a page twice is harmless.'],
    [''],
    ['STEP 5. PTG menu → Import VAN export…'],
    ['• Choose the file (or paste the copied rows) and click Import. The message tells you which tab it filled, how many rows, and how duplicates were recognized.'],
    ['• Shifts files replace the previous one. Survey rows add up across imports and pastes.'],
    ['• After an import, the Setup dropdowns for questions, answers, event types and names offer the values found in your data.'],
    [''],
    ['STEP 6. Click Run now (in the dialog, or PTG menu → Run now). Read the one-line summary; the PTG tab fills in.'],
    ['The summary says how many shifts were credited to a person, how many landed on the Unassigned row and why, how many cancelled-event shifts were skipped, and how many past shifts are still not marked Completed in VAN.'],
    [''],
    ['Daily from then on: Steps 3, 4 (if needed), 5, 6. About five minutes.'],
    [''],
    ['If something looks wrong'],
    ['• The log tab has one line per import and run, newest at the bottom.'],
    ['• A run says a column is missing: PTG → Show imported columns lists the exact headers; the Advanced rows on Setup offer them as a dropdown.'],
    ['• Everything is on the Unassigned row: the names in "Their name in VAN" don\'t match VAN\'s; unhide the import tab (View → Hidden sheets) and copy a name as VAN writes it, or use the dropdown.'],
    ['• A survey column counts nobody: the summary lists the answers seen for that question; copy the right one into "Which answer counts".'],
    ['• PTG → Clear imported VAN data removes the imported rows and the name lists offered on Setup (the numbers on PTG stay until the next run). Do this before sharing the sheet widely.'],
    ['• To start Setup over from the examples: PTG → Reset Setup and README to sample values…'],
    [''],
    ['What the numbers mean (short version; full definitions in docs/metrics.md on GitHub)'],
    ['• Every number is for that week only; no running totals. Weeks run from your "Week starts on" day; the last week runs through election day.'],
    ['• Completed shifts: signups marked Completed, in the week of the event; one per person + event + date + shift. Scheduled shifts: every commitment due that week (scheduled, confirmed, completed, no-show). No-shows: status No Show.'],
    ['• People who completed a shift: distinct people that week. New volunteers: people whose first completed shift in the loaded data is that week.'],
    ['• People who first answered a survey question: each person once, in the week of their earliest loaded answer. People whose current answer is…: their latest answer, in the week it was given.'],
    ['• Who gets credit: the person in Recruited By (shifts) or Canvassed By (survey) if listed under a group; else the event-name prefix; else the * group; else the Unassigned row, which still counts in the total.'],
    [''],
    ['Full documentation and the code: https://github.com/AI-Dems/ai-dems-gotv-tools/tree/main/tools/ptg']
  ];
  sheet.getRange(1, 1, lines.length, 1).setValues(lines);
  sheet.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  lines.forEach(function (l, i) { if (/^(STEP \d|Daily from then on|If something looks wrong|What the numbers mean)/.test(l[0])) sheet.getRange(i + 1, 1).setFontWeight('bold'); });
  sheet.setColumnWidth(1, 980);
  sheet.getRange(1, 1, lines.length, 1).setWrap(true);
  var ss = SpreadsheetApp.getActive();
  ss.setActiveSheet(sheet); ss.moveActiveSheet(1);
}

/* ---------- helpers ---------- */

function getOrCreate_(name) {
  var ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// colLetter_ lives in Config.js (shared global).
