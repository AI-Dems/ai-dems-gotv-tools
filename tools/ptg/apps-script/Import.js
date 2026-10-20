/**
 * Import.js — getting VAN exports into the sheet and reading them back.
 *
 * Two hidden tabs hold the latest exports as-is:
 *   VAN survey export   one row per person (or per response), from a VAN list export
 *   VAN shifts export   one row per event signup, from a VAN event participation export
 *
 * Users fill them either with PTG → Import VAN export (CSV / tab-delimited TXT,
 * parsed here) or with Sheets' own File → Import onto the tab (any format).
 *
 * VAN's report downloads (e.g. the Event Participant Report) start with a line
 * "SEP=," that tells Excel the separator, so the real header is on line 2. Both
 * paths find the header row by looking for a VanID-type column (findHeaderRow)
 * instead of assuming it is row 1; anything above it is ignored.
 */

var SURVEY_TAB = 'VAN survey export';
var SHIFTS_TAB = 'VAN shifts export';
var MAX_UPLOAD_CHARS = 20 * 1024 * 1024;   // ~20 MB of text; google.script.run can't carry much more

/** Opens the upload dialog (Upload.html). */
function showImportDialog() {
  var html = HtmlService.createHtmlOutputFromFile('Upload').setWidth(460).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Import VAN export');
}

/**
 * Called from Upload.html with the file's text. Detects whether it is a survey
 * or shifts export from its header, writes it to the matching tab, and returns
 * a one-line summary for the dialog.
 */
function importExportText(text, filename) {
  try {
    return importExportText_(text, filename);
  } catch (err) {
    try { log_('error', 'import of ' + filename + ' failed: ' + err.message); } catch (e) { /* the log tab is not essential */ }
    throw err;
  }
}

function importExportText_(text, filename) {
  if (!text) throw new Error('The file is empty.');
  if (text.length > MAX_UPLOAD_CHARS) throw new Error('File is too large for the dialog. Use File → Import onto the "' + SURVEY_TAB + '" or "' + SHIFTS_TAB + '" tab instead.');
  var cleaned = stripSepLine(text.replace(/^\uFEFF/, ''));
  var rows = Utilities.parseCsv(cleaned.text, cleaned.delimiter || detectDelimiter_(cleaned.text));
  var names = vanIdNames_();
  var headerAt = headerRowIndex(rows, names);
  var start = findHeaderRow(rows, names);
  rows = rows.slice(start);
  var skipped = (cleaned.delimiter ? 1 : 0) + start;

  if (headerAt < 0) {
    // No VANID-type header. If the first row still looks like a header (it names an event or survey column),
    // the export simply lacks VANID: say so instead of filing header text as data.
    var looksLikeHeader = ['shiftEventName', 'shiftStatus', 'surveyQuestion', 'surveyResponse', 'surveyCanvasser', 'shiftCredit'].some(function (k) { return resolveColumn(rows[0], '', COLUMN_CANDIDATES[k]); });
    if (looksLikeHeader) throw new Error('This export has no VANID column (tried ' + COLUMN_CANDIDATES.surveyVanId.join(', ') + '). Add VANID in VAN (Edit Columns) and export again, or name its column in the Advanced block on Setup. First row seen: ' + firstCells_(rows) + '.');
    // Otherwise: body rows for whatever survey data is already loaded.
    var current = readTabValues_(SURVEY_TAB);
    if (!current.length) throw new Error('No header row found (no cell named ' + COLUMN_CANDIDATES.surveyVanId.slice(0, 3).join(', ') + '…) and nothing is loaded yet. First row seen: ' + firstCells_(rows) + '. If that is your header but it shows as one cell, the columns were not separated: copy the table again, or export the file instead.');
    var m0 = mergeImportRows(current, rows, surveyIdColumn_(current[0]), names, surveyNaturalKey_(current[0]), surveyAliases_());
    writeImportTab_(SURVEY_TAB, m0.rows);
    refreshSetupDropdowns_();
    log_('import', filename + ' → ' + SURVEY_TAB + ' (rows without a header, added under the existing one in the same column order), +' + m0.added + ', ' + m0.updated + ' refreshed, ' + m0.skipped + ' duplicate(s) skipped (' + m0.method + '), now ' + (m0.rows.length - 1) + ' rows');
    return mergeCounts_(m0) + ' These rows had no header, so they were read in the same column order as what is already loaded; include the header row when you can. ' + dedupeNote_(m0.method) + ' Paste the next page, import another file, or click Run now.';
  }

  if (rows.length < 2) throw new Error('No data rows found in ' + filename + '.');
  var kind = detectKind_(rows[0]);
  if (kind === 'unknown') throw new Error('This does not look like a report the sheet knows. It reads the Event Participant Report (has an "Event Name" column) and the Survey Response Report (has a "Survey Question Name" column). Columns found: ' + rows[0].filter(Boolean).slice(0, 12).join(', ') + (rows[0].length > 12 ? ', …' : '') + '. Other VAN reports (Contact History, Activist Codes) are not supported yet; nothing was imported.');
  if (kind === 'shifts') {
    // The shifts export covers the whole program each time, so it replaces what was there.
    writeImportTab_(SHIFTS_TAB, rows);
    refreshSetupDropdowns_();
    log_('import', filename + ' → ' + SHIFTS_TAB + ', ' + (rows.length - 1) + ' rows' + (skipped ? ', skipped ' + skipped + ' line(s) above the header' : '') + ', columns: ' + rows[0].join(', '));
    return 'Loaded ' + (rows.length - 1) + ' rows into "' + SHIFTS_TAB + '"' + (skipped ? ' (skipped ' + skipped + ' line' + (skipped === 1 ? '' : 's') + ' above the header)' : '') + '. Import another file, or click Run now.';
  }
  // Survey data accumulates: VAN's Survey Response Report is limited to a 30-day window
  // and its on-screen table comes 100 rows a page, so several imports or pastes add up.
  var existing = readTabValues_(SURVEY_TAB);
  var m = mergeImportRows(existing, rows, surveyIdColumn_(rows[0]), names, surveyNaturalKey_(rows[0]), surveyAliases_());
  writeImportTab_(SURVEY_TAB, m.rows);
  refreshSetupDropdowns_();
  log_('import', filename + ' → ' + SURVEY_TAB + ', +' + m.added + ' rows, ' + m.updated + ' refreshed, ' + m.skipped + ' duplicate(s) skipped (' + m.method + '), now ' + (m.rows.length - 1) + ' rows' + (skipped ? ', skipped ' + skipped + ' line(s) above the header' : '') + ', columns: ' + m.rows[0].join(', '));
  return mergeCounts_(m) + ' ' + dedupeNote_(m.method) + ' Paste the next page, import another file, or click Run now. PTG → Clear imported VAN data starts over.';
}

/** The survey tab's current values, header first, or [] when empty. */
function readTabValues_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 1) return [];
  var tz = sheet.getParent().getSpreadsheetTimeZone();
  return sheet.getDataRange().getValues().map(function (r) { return r.map(function (c) { return cellText_(c, tz); }); });
}

/** Normalized header of the column that identifies one survey response (VAN's "Survey Response ID"), or null. */
function surveyIdColumn_(header) {
  var configured = '';
  try { configured = readConfig().columns.surveyResponseId; } catch (e) { /* Setup incomplete */ }
  return resolveColumn(header, configured, COLUMN_CANDIDATES.surveyResponseId);
}

/**
 * Index of the row that holds a VanID-type header within the first 20 rows, or -1.
 * (findHeaderRow is the forgiving version that always returns a row.)
 */
function headerRowIndex(rows, names) {
  var wanted = (names || []).map(function (n) { return String(n).trim().toLowerCase(); }).filter(Boolean);
  var limit = Math.min(rows.length, 20);
  for (var i = 0; i < limit; i++) {
    if (rows[i].some(function (c) { return wanted.indexOf(String(c == null ? '' : c).trim().toLowerCase()) >= 0; })) return i;
  }
  return -1;
}

/**
 * Merge incoming rows into rows already loaded (both header-first; existing may be []).
 * - Columns are matched by header name, ignoring case; incoming columns the existing
 *   header lacks are added on the right.
 * - Incoming rows equal to a header row (repeated headers from a multi-page paste) are dropped.
 * - When incoming has no header (headerRowIndex < 0) its rows are taken as data in the
 *   existing column order.
 * - Headers spelled differently but meaning the same column ("Survey Question Name" vs
 *   "Survey Question") are merged when both appear in one group of `aliases`.
 * - Duplicates: a row is a duplicate when its `idColumn` value (VAN's Survey Response ID,
 *   one per response record) or its natural key (the `keyColumns`: VANID, question, answer,
 *   date, canvasser, with dates normalized) matches a row already kept. Both keys are
 *   remembered for every stored row, so a later paste without the ID column still matches.
 *   A row whose id matches REPLACES the stored row (the newer export is fresher, e.g. the
 *   most-recent flag may have changed); it counts as `updated`. If neither key is possible,
 *   every cell is compared. `method` in the result says which applied.
 * Returns {rows, added, skipped, updated, method}. Pure; tested in Node.
 */
function mergeImportRows(existing, incoming, idColumn, vanIdNames, keyColumns, aliases) {
  var cell = function (c) { return String(c == null ? '' : c).trim(); };
  var key = function (c) { return cell(c).toLowerCase(); };
  if (!existing.length) existing = [];
  var incomingHasHeader = headerRowIndex(incoming, vanIdNames) >= 0;
  var header = existing.length ? existing[0].map(cell) : (incomingHasHeader ? incoming[0].map(cell) : null);
  if (!header) throw new Error('No header row found.');
  var headerKeys = header.map(key);
  var groupsOf = (aliases || []).map(function (g) { return g.map(function (n) { return String(n).trim().toLowerCase(); }); });
  // Index in the merged header for an incoming header: the same name, else a synonym already present, else -1.
  var indexFor = function (h) {
    var k = h.toLowerCase(), i = headerKeys.indexOf(k);
    if (i >= 0 || !k) return i;
    for (var g = 0; g < groupsOf.length; g++) {
      if (groupsOf[g].indexOf(k) < 0) continue;
      for (var j = 0; j < headerKeys.length; j++) if (groupsOf[g].indexOf(headerKeys[j]) >= 0) return j;
    }
    return -1;
  };
  var inHeader = incomingHasHeader ? incoming[0].map(cell) : header.slice();
  inHeader.forEach(function (h) { if (h && indexFor(h) < 0) { header.push(h); headerKeys.push(h.toLowerCase()); } });
  var width = header.length;
  var pad = function (r) { var out = r.slice(0, width).map(cell); while (out.length < width) out.push(''); return out; };
  var map = inHeader.map(function (h) { return h ? indexFor(h) : -1; });  // incoming col -> merged col
  var idIdx = idColumn ? headerKeys.indexOf(String(idColumn).toLowerCase()) : -1;
  var keyIdx = (keyColumns || []).map(function (k) { return k ? headerKeys.indexOf(String(k).toLowerCase()) : -1; });
  var naturalOk = keyIdx.length > 0 && keyIdx.every(function (i) { return i >= 0; });
  var method = idIdx >= 0 ? 'id' : (naturalOk ? 'natural' : 'cells');
  var dayOrText = function (c) { return toDay(c) || c.toLowerCase(); };
  // Every key a row can be recognized by: its id, its natural key, or (last resort) all its cells.
  var rowKeys = function (r) {
    var ks = [];
    if (idIdx >= 0 && r[idIdx] !== '') ks.push('id:' + r[idIdx].toLowerCase());
    if (naturalOk) ks.push('nat:' + keyIdx.map(function (i) { return dayOrText(r[i]); }).join('\u0001'));
    if (!ks.length) ks.push('row:' + r.map(function (c) { return dayOrText(c); }).join('\u0001'));
    return ks;
  };
  var isHeaderRow = function (r) { return r.length && r.every(function (c, i) { return key(c) === (headerKeys[map[i]] || ''); }) && r.some(function (c) { return cell(c); }); };

  var out = [header], pos = {};                                           // key -> index in out
  var remember = function (ks, index) { ks.forEach(function (k) { pos[k] = index; }); };
  existing.slice(1).forEach(function (r) { var p = pad(r); if (p.every(function (c) { return c === ''; })) return; remember(rowKeys(p), out.length); out.push(p); });
  var added = 0, skipped = 0, updated = 0;
  incoming.slice(incomingHasHeader ? 1 : 0).forEach(function (r) {
    if (r.every(function (c) { return cell(c) === ''; })) return;
    if (isHeaderRow(r)) return;
    var p = new Array(width).fill('');
    r.forEach(function (c, i) { if (map[i] >= 0) p[map[i]] = cell(c); });
    var ks = rowKeys(p);
    var idKey = ks.filter(function (k) { return k.indexOf('id:') === 0; })[0];
    if (idKey && pos[idKey] !== undefined) {                              // same response record: refresh it
      var at = pos[idKey];
      if (out[at].join('\u0001') !== p.join('\u0001')) updated++; else skipped++;
      out[at] = p; remember(ks, at); return;
    }
    if (ks.some(function (k) { return pos[k] !== undefined; })) { skipped++; return; }
    remember(ks, out.length); out.push(p); added++;
  });
  return { rows: out, added: added, skipped: skipped, updated: updated, method: method };
}

/** Header synonyms VAN uses for the survey export's columns, so differently spelled pastes land in one column. */
function surveyAliases_() {
  return [COLUMN_CANDIDATES.surveyVanId, COLUMN_CANDIDATES.surveyQuestion, COLUMN_CANDIDATES.surveyResponse, COLUMN_CANDIDATES.surveyDate, COLUMN_CANDIDATES.surveyCanvasser, COLUMN_CANDIDATES.surveyFlag, COLUMN_CANDIDATES.surveyResponseId];
}

/** "+N rows, M refreshed, K duplicates skipped; T rows in all." */
function mergeCounts_(m) {
  return 'Added ' + m.added + ' rows' + (m.updated ? ', refreshed ' + m.updated : '') + '; ' + m.skipped + ' duplicates skipped; ' + (m.rows.length - 1) + ' rows in all.';
}

/** Columns that identify one survey response when there is no Survey Response ID: VANID, question, answer, date, canvasser. */
function surveyNaturalKey_(header) {
  var cfg = {};
  try { cfg = readConfig().columns; } catch (e) { /* Setup incomplete */ }
  var cols = [
    resolveColumn(header, cfg.surveyVanId, COLUMN_CANDIDATES.surveyVanId),
    resolveColumn(header, cfg.surveyQuestion, COLUMN_CANDIDATES.surveyQuestion),
    resolveColumn(header, cfg.surveyResponse, COLUMN_CANDIDATES.surveyResponse),
    resolveColumn(header, cfg.surveyDate, COLUMN_CANDIDATES.surveyDate),
    resolveColumn(header, cfg.surveyCanvasser, COLUMN_CANDIDATES.surveyCanvasser)
  ];
  return cols.every(Boolean) ? cols : [];
}

/** One sentence for the dialog about how duplicates were recognized. */
function dedupeNote_(method) {
  if (method === 'id') return 'Duplicates recognized by Survey Response ID.';
  if (method === 'natural') return 'No Survey Response ID column: duplicates recognized by VANID + question + answer + date + canvasser. Add the ID column (Edit Columns → Select All) for exact matching.';
  return 'WARNING: no Survey Response ID and not all of VANID, question, answer, date and canvasser were found, so duplicates were judged by every cell. Re-import with Edit Columns → Select All.';
}

/** Tab if the first non-empty line has at least one tab and no fewer tabs than commas, else comma. */
function detectDelimiter_(text) {
  var lines = text.split(/\r?\n/), first = '';
  for (var i = 0; i < lines.length; i++) if (lines[i].trim()) { first = lines[i]; break; }
  var tabs = first.split('\t').length - 1, commas = first.split(',').length - 1;
  return (tabs > 0 && tabs >= commas) ? '\t' : ',';
}

/** The first few cells of the first non-empty row, quoted, for error messages. */
function firstCells_(rows) {
  for (var i = 0; i < rows.length; i++) {
    var cells = rows[i].map(function (c) { return String(c == null ? '' : c).trim(); }).filter(Boolean);
    if (cells.length) return cells.slice(0, 4).map(function (c) { return '"' + c.slice(0, 40) + '"'; }).join(', ') + (cells.length > 4 ? ', …' : '') + ' (' + rows[i].length + ' cell' + (rows[i].length === 1 ? '' : 's') + ' in the row)';
  }
  return '(no cells)';
}

/**
 * VAN's CSV downloads begin with a line like "SEP=," (Excel's hint for which
 * character separates the columns). It is not data. Remove it and return the
 * delimiter it names, so the real header is parsed as the first row.
 * Returns {text, delimiter}; delimiter is null when there was no such line.
 */
function stripSepLine(text) {
  var m = /^\s*sep=(.)\r?\n/i.exec(text);
  if (!m) return { text: text, delimiter: null };
  return { text: text.slice(m[0].length), delimiter: m[1] };
}

/**
 * Index of the header row in parsed rows: the first of the first 20 rows that
 * contains one of `names` (a VanID-type column; compared trimmed, ignoring
 * case). VAN puts a "SEP=" hint, and sometimes a report title, above the
 * headers, and Sheets' File → Import keeps those rows. If no row has a
 * VanID-type column, skip leading blank and "sep=" rows and use the next one,
 * so a file with an unusual VanID header still imports as before.
 */
function findHeaderRow(rows, names) {
  var wanted = (names || []).map(function (n) { return String(n).trim().toLowerCase(); }).filter(Boolean);
  var limit = Math.min(rows.length, 20);
  var cell = function (c) { return String(c == null ? '' : c).trim().toLowerCase(); };
  for (var i = 0; i < limit; i++) {
    if (rows[i].some(function (c) { return wanted.indexOf(cell(c)) >= 0; })) return i;
  }
  for (var j = 0; j < limit; j++) {
    var blank = rows[j].every(function (c) { return cell(c) === ''; });
    if (!blank && !/^sep=/.test(cell(rows[j][0]))) return j;
  }
  return 0;
}

/** Header names that mark the real header row: VAN's usual VanID headers plus any configured on Setup. */
function vanIdNames_() {
  var names = COLUMN_CANDIDATES.surveyVanId.concat(COLUMN_CANDIDATES.shiftVanId);
  try {
    var cols = readConfig().columns;
    if (cols.surveyVanId) names.push(cols.surveyVanId);
    if (cols.shiftVanId) names.push(cols.shiftVanId);
  } catch (e) { /* Setup incomplete; candidates alone */ }
  return names;
}

/**
 * 'shifts' if the header has an event-name column (configured or a known
 * candidate), otherwise 'survey'. If Setup isn't filled in yet, fall back to
 * the candidate list alone.
 */
function detectKind_(header) {
  var cols = {}, metrics = [];
  try { var cfg = readConfig(); cols = cfg.columns; metrics = cfg.metrics; } catch (e) { /* Setup incomplete; use candidates */ }
  if (resolveColumn(header, cols.shiftEventName, COLUMN_CANDIDATES.shiftEventName)) return 'shifts';          // Event Participant Report
  if (resolveColumn(header, cols.surveyQuestion, COLUMN_CANDIDATES.surveyQuestion)) return 'survey';          // Survey Response Report
  // An older per-person list export: it carries the answer columns named on Setup's survey rows.
  var have = header.map(norm);
  if (metrics.some(function (m) { return !isShiftMetric(m) && m.valueColumn && have.indexOf(norm(m.valueColumn)) >= 0; })) return 'survey';
  return 'unknown';   // e.g. a Contact History or Activist Codes report: the tool has no rule for it yet
}

function writeImportTab_(name, rows) {
  var sheet = getOrCreate_(name);
  sheet.clearContents();
  var width = rows.reduce(function (w, r) { return Math.max(w, r.length); }, 0);
  rows.forEach(function (r) { while (r.length < width) r.push(''); });
  growTo_(sheet, rows.length, width);   // a new tab is 1000 × 26; a Select-All export or a long survey archive is bigger
  // Plain-text format first, or Sheets turns "10:00 AM", "3/5" and "1-5" into dates and numbers,
  // which would merge distinct shift times and break answer matching.
  sheet.getRange(1, 1, rows.length, width).setNumberFormat('@').setValues(rows);
  sheet.hideSheet();
}

/**
 * A cell read back from a tab -> text. Dates (which File -> Import creates) keep their time when they have
 * one, and a time-only Date (Sheets' 1899-12-30) becomes just the time, so distinct shift times stay distinct.
 */
function cellText_(c, timezone) {
  if (!(c instanceof Date)) return c;
  var day = Utilities.formatDate(c, timezone, 'yyyy-MM-dd'), time = Utilities.formatDate(c, timezone, 'HH:mm:ss');
  if (day === '1899-12-30') return time;
  return time === '00:00:00' ? day : day + ' ' + time;
}

/**
 * Read an import tab into {header, records}. Date cells (Sheets converts
 * '10/7/2026' to a Date on File → Import) become 'yyyy-MM-dd' strings.
 */
function readImportTab_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var values = sheet.getDataRange().getValues();
  var start = findHeaderRow(values, vanIdNames_());
  if (values.length - start < 2) return null;
  var tz = sheet.getParent().getSpreadsheetTimeZone();
  var header = values[start].map(String);
  var rows = values.slice(start + 1).map(function (row) {
    return row.map(function (c) { return cellText_(c, tz); });
  });
  return { header: header, records: toRecords(header, rows) };
}

function clearImports() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Delete the imported VAN data from this sheet? The PTG numbers stay; you will need to import again before the next run.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  [SURVEY_TAB, SHIFTS_TAB].forEach(function (n) {
    var s = SpreadsheetApp.getActive().getSheetByName(n);
    if (s) s.clearContents();
  });
  refreshSetupDropdowns_();   // nothing imported now: the name/question/answer lists on Setup go away too
  log_('info', 'Imported VAN data cleared');
  ui.alert('Cleared.');
}

if (typeof module !== 'undefined') {
  if (typeof toDay === 'undefined') { var toDay = require('./Metrics.js').toDay; }   // Apps Script shares globals; Node does not
  module.exports = { stripSepLine: stripSepLine, findHeaderRow: findHeaderRow, headerRowIndex: headerRowIndex, mergeImportRows: mergeImportRows };
}
