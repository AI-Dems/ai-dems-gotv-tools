/**
 * Config.js — reads the Setup tab into a plain config object.
 *
 * The Setup tab has four blocks, each introduced by a bold title in column A:
 *   Settings   key/value pairs (A = label, B = value)
 *   Groups     table, columns found by header text: Name on dashboard | Their name in VAN | Or events starting with
 *   Metrics    table: Column on dashboard | What to count | Which survey question | Which answer counts |
 *              Only these event types | Date column (advanced) | Canvasser column (advanced)
 *   Advanced   key/value pairs naming columns in the exports (blank = auto-detect). Older sheets call it "Columns".
 * Sam's original machine-name headers (group_code, display_name, van_users, event_prefixes, metric_key, label,
 * type, value_column, …) are still accepted, so existing sheets keep working. A block runs until the next
 * title; blank rows inside it are skipped, and rows whose first cell starts with "Example" are shown to the
 * user but never read. Dashboard keys are derived from the labels when no key column is present.
 */

var SETUP_TAB = 'Setup';
var SURVEY_TYPES = ['survey_first_response', 'survey_current_response'];
// All metric types: SURVEY_TYPES plus SHIFT_TYPES from Metrics.js. Computed when needed, since Apps Script
// does not promise which file's top level runs first.
function metricTypes_() { return SURVEY_TYPES.concat(SHIFT_TYPES, ['external']); }   // external: counted by a warehouse, not by this sheet

var SETTINGS_KEYS = {
  'Campaign name': 'campaignName',
  'Program start date': 'programStart',
  'Election day': 'electionDay',
  'Week starts on': 'weekStartDay',
  'Timezone': 'timezone',
  'Dashboard title': 'dashboardTitle',
  'Total row label': 'totalLabel',
  'Unassigned row label': 'unassignedLabel',
  'Ignore events starting with': 'ignorePrefixes',
  'Raw tab is fed from outside': 'externalRaw'
};

// Group code of the automatic row that holds whatever no group claimed. Not a Setup row.
var UNASSIGNED_CODE = 'UNASSIGNED';

var COLUMN_KEYS = {
  'Survey export: VanID column': 'surveyVanId',
  'Survey export: question name column (optional)': 'surveyQuestion',
  'Survey export: response column (optional)': 'surveyResponse',
  'Survey export: date column (optional)': 'surveyDate',
  'Survey export: canvasser column (optional)': 'surveyCanvasser',
  'Survey export: most-recent flag column (optional)': 'surveyFlag',
  'Survey export: response id column (optional)': 'surveyResponseId',
  'Shifts export: VanID column': 'shiftVanId',
  'Shifts export: event name column': 'shiftEventName',
  'Shifts export: event date column': 'shiftEventDate',
  'Shifts export: status column': 'shiftStatus',
  'Shifts export: shift column (optional)': 'shiftShift',
  'Shifts export: credit column (optional)': 'shiftCredit',
  'Shifts export: organizer column (optional)': 'shiftOrganizer',
  'Shifts export: event type column (optional)': 'shiftEventType'
};

// Header names VAN commonly uses, tried in order when the Columns block is blank.
var COLUMN_CANDIDATES = {
  surveyVanId: ['VANID', 'VanID', 'Voter File VANID', 'MyCampaign ID', 'Van ID', 'ID'],
  // VAN's Survey Response Report: one row per response. Its question-name column selects the long format.
  surveyQuestion: ['Survey Question Name', 'Survey Question', 'Question Name', 'Question'],
  surveyResponse: ['Survey Response', 'Response', 'Survey Response Name'],
  surveyDate: ['Date Canvassed', 'Date Applied', 'Date Created', 'Date'],
  surveyCanvasser: ['Canvassed By', 'Applied By', 'Entered By', 'Canvasser'],
  surveyFlag: ['Is Most Recent Response', 'Most Recent Response', 'Is Current'],
  surveyResponseId: ['Survey Response ID', 'Response ID'],
  shiftVanId: ['VANID', 'VanID', 'Voter File VANID', 'MyCampaign ID', 'Van ID', 'ID'],
  shiftEventName: ['Event Name', 'EventName', 'Event'],
  shiftEventDate: ['Event Date', 'EventDate', 'Start Date', 'Date', 'Shift Date'],
  shiftStatus: ['Status', 'Signup Status', 'Event Status', 'Participation Status'],
  shiftShift: ['Shift', 'Shift Name', 'Shift Time', 'Shift Start Time'],
  // Who gets credit for a shift: VAN's "Recruited By" on the signup, when present.
  shiftCredit: ['Recruited By', 'Recruiter', 'Recruited By Name', 'Staff'],
  // The volunteer's own organizer (a Select-All Event Participant Report carries these DCCC turf columns); used when Recruited By is blank or unlisted.
  shiftOrganizer: ['DCCC Organizer', 'DCCC Volunteer Organizing Turf: DCCC Volunteer Organizer', 'DCCC Administrative Organizing Turf: DCCC Administrative Organizer', 'Organizer', 'Turf Organizer'],
  shiftEventType: ['Event Type', 'Event Type Name', 'Type']
};

// Plain-language names for the seven counting rules, used in the "What to count" dropdown.
var TYPE_PHRASES = {
  external: 'Fed from outside (warehouse writes raw)',
  shifts_completed: 'Completed shifts',
  shifts_scheduled: 'Scheduled shifts (commitments)',
  shifts_flaked: 'No-shows',
  active_volunteers: 'People who completed a shift',
  new_volunteers: 'New volunteers (first completed shift)',
  survey_first_response: 'People who first answered a survey question',
  survey_current_response: 'People whose current answer is…'
};
function typePhrases_() { return metricTypes_().map(function (t) { return TYPE_PHRASES[t]; }); }

// Each table field accepts a plain header (first) and Sam's machine-name header, matched ignoring case.
var GROUP_HEADERS = {
  name: ['Name on dashboard', 'display_name'],
  code: ['Short code (optional)', 'group_code'],
  vanUsers: ['Their name in VAN', 'van_users'],
  eventPrefixes: ['Or events starting with', 'event_prefixes']
};
var METRIC_HEADERS = {
  label: ['Column on dashboard', 'label'],
  key: ['Short code (optional)', 'metric_key'],
  type: ['What to count', 'type'],
  valueColumn: ['Which survey question', 'value_column'],
  responseName: ['Which answer counts', 'response_name'],
  eventTypes: ['Only these event types', 'event_type'],
  dateColumn: ['Date column (advanced)', 'date_column'],
  canvasserColumn: ['Canvasser column (advanced)', 'canvasser_column']
};
var BLOCK_TITLES = ['Settings', 'Groups', 'Metrics', 'Columns', 'Advanced'];
var EXAMPLE_ROW = /^\s*example\b/i;

function readConfig() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SETUP_TAB);
  if (!sheet) throw new Error('No "' + SETUP_TAB + '" tab. Run PTG → Build sheet first.');
  return parseSetup(sheet.getDataRange().getValues(), sheet.getParent().getSpreadsheetTimeZone());
}

/** Pure: the Setup tab's cell values -> config. Tested in Node. */
function parseSetup(values, timezone) {
  var blocks = splitBlocks_(values);
  var cfg = { groups: [], metrics: [], columns: {}, warnings: [] };   // warnings: things worth saying that don't stop a run

  rowsOf_(blocks, 'Settings').forEach(function (r) {
    var key = SETTINGS_KEYS[String(r.row[0]).trim()];
    if (key) cfg[key] = r.row[1];
  });
  cfg.programStart = toDay_(cfg.programStart, 'Program start date', timezone);
  cfg.electionDay = toDay_(cfg.electionDay, 'Election day', timezone);
  cfg.weekStartDay = String(cfg.weekStartDay || 'Monday');
  cfg.timezone = String(cfg.timezone || 'America/New_York');
  cfg.totalLabel = String(cfg.totalLabel || 'TOTAL');
  cfg.dashboardTitle = String(cfg.dashboardTitle || cfg.campaignName || 'Progress to Goal');
  cfg.unassignedLabel = String(cfg.unassignedLabel || 'Unassigned');
  cfg.unassigned = { code: UNASSIGNED_CODE, name: cfg.unassignedLabel, vanUsers: [], eventPrefixes: [] };
  // Events whose name starts with one of these never count (cancelled events keep their Completed signups in VAN).
  // Blank or missing = the default; type "none" to count cancelled events too.
  cfg.ignorePrefixes = cfg.ignorePrefixes === undefined || String(cfg.ignorePrefixes).trim() === '' ? ['[Cancelled]']
    : String(cfg.ignorePrefixes).trim().toLowerCase() === 'none' ? [] : splitList_(cfg.ignorePrefixes);
  // "Yes" when a warehouse (BigQuery, Civis, Portal) writes the raw tab itself; Run now then only checks the dashboard.
  cfg.externalRaw = /^(yes|true|y|1)$/i.test(String(cfg.externalRaw == null ? '' : cfg.externalRaw).trim());

  rowsOf_(blocks, 'Columns').concat(rowsOf_(blocks, 'Advanced')).forEach(function (r) {
    var key = COLUMN_KEYS[String(r.row[0]).trim()];
    if (key) cfg.columns[key] = String(r.row[1] || '').trim();
  });

  var g = table_(blocks, 'Groups', GROUP_HEADERS);
  var usedCodes = {};
  g.rows.forEach(function (r) {
    var name = g.get(r, 'name'), code = g.get(r, 'code');
    if (!name && !code) return;
    if (!name) name = code;
    if (!code) code = uniqueKey_(slug_(name), usedCodes);
    if (code.toLowerCase() === UNASSIGNED_CODE.toLowerCase()) throw new Error(g.where(r, 'name') + ': "' + name + '" clashes with the automatic Unassigned row (its label is a Setting). Choose another name for this group.');
    usedCodes[code] = true;
    cfg.groups.push({ code: code, name: name, vanUsers: splitPeople_(g.get(r, 'vanUsers')), eventPrefixes: splitList_(g.get(r, 'eventPrefixes')) });
  });

  var t = table_(blocks, 'Metrics', METRIC_HEADERS);
  var usedKeys = {};
  t.rows.forEach(function (r) {
    var label = t.get(r, 'label'), key = t.get(r, 'key'), typed = t.get(r, 'type');
    if (!label && !key && !typed) return;
    if (!label) label = key;
    if (!label) throw new Error(t.where(r, 'label') + ' is blank. Type the column heading you want on the dashboard, e.g. Shifts Completed.');
    if (!key) key = uniqueKey_(slug_(label), usedKeys);
    usedKeys[key] = true;
    var m = {
      key: key, label: label, type: normalizeType(typed),
      valueColumn: t.get(r, 'valueColumn'), dateColumn: t.get(r, 'dateColumn'), canvasserColumn: t.get(r, 'canvasserColumn'),
      responseName: t.get(r, 'responseName'), eventTypes: splitList_(t.get(r, 'eventTypes'))
    };
    if (!m.type) throw new Error(t.where(r, 'type') + ': "' + typed + '" is not one of the choices. Pick what to count from the dropdown: ' + typePhrases_().join('; ') + '.');
    if (!isShiftMetric(m) && m.type !== 'external' && !m.valueColumn) throw new Error(t.where(r, 'valueColumn') + ' is blank for "' + label + '". Type the survey question\'s name exactly as VAN shows it (after an import, the cell offers the questions found).');
    if (m.type === 'survey_current_response' && !m.responseName) throw new Error(t.where(r, 'responseName') + ' is blank for "' + label + '". Type the answer that counts (e.g. Yes), several separated by semicolons, or * for any answer.');
    if (m.type === 'survey_first_response' && m.responseName) cfg.warnings.push(t.where(r, 'responseName') + ': "' + m.responseName + '" is ignored for "' + label + '": "' + TYPE_PHRASES.survey_first_response + '" counts a person\'s first answer whatever it is. To count only people whose answer is ' + m.responseName + ', choose "' + TYPE_PHRASES.survey_current_response + '".');
    if (isShiftMetric(m) && m.valueColumn) cfg.warnings.push(t.where(r, 'valueColumn') + ': "' + m.valueColumn + '" is ignored for "' + label + '": shift columns come from the Event Participant Report, not a survey question.');
    cfg.metrics.push(m);
  });

  if (!cfg.groups.length) throw new Error('Setup, Groups: add at least one row under the headers (a person, team or turf to track). Rows starting with "Example" are ignored.');
  if (!cfg.metrics.length) throw new Error('Setup, Metrics: add at least one row under the headers. Rows starting with "Example" are ignored.');
  cfg.weeks = computeWeeks(cfg.programStart, cfg.electionDay, cfg.weekStartDay);
  return cfg;
}

/**
 * Split the Setup values into blocks keyed by title. A block runs until the next title. Blank rows and
 * "Example…" rows are dropped. Each block is a list of {row, n} with n the 1-based sheet row.
 */
function splitBlocks_(values) {
  var blocks = {}, current = null;
  values.forEach(function (row, i) {
    var a = String(row[0] == null ? '' : row[0]).trim();
    if (BLOCK_TITLES.indexOf(a) >= 0) { current = a; blocks[a] = blocks[a] || []; return; }   // a title in column A starts a block
    if (!current) return;
    if (row.every(function (c) { return c === '' || c == null; })) return;
    if (EXAMPLE_ROW.test(a)) return;
    blocks[current].push({ row: row, n: i + 1 });
  });
  return blocks;
}

function rowsOf_(blocks, title) { return blocks[title] || []; }

/** A table block: header row first, then data rows. Fields are located by header text. */
function table_(blocks, title, HEADERS) {
  var list = rowsOf_(blocks, title);
  var header = list.length ? list[0].row.map(function (c) { return hkey_(c); }) : [];
  var headerText = list.length ? list[0].row.map(function (c) { return String(c == null ? '' : c).trim(); }) : [];
  var col = {};
  Object.keys(HEADERS).forEach(function (f) {
    col[f] = -1;
    HEADERS[f].forEach(function (name) { if (col[f] < 0) col[f] = header.indexOf(hkey_(name)); });
  });
  return {
    rows: list.slice(1),
    col: col,
    get: function (r, f) { return col[f] >= 0 ? String(r.row[col[f]] == null ? '' : r.row[col[f]]).trim() : ''; },
    where: function (r, f) {
      var c = col[f] >= 0 ? col[f] : HEADERS[f].length;   // a missing column: point at where it would be
      return 'Setup row ' + r.n + ', column ' + colLetter_(c + 1) + (col[f] >= 0 ? ' ("' + headerText[c] + '")' : ' ("' + HEADERS[f][0] + '")');
    }
  };
}

function hkey_(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }

/** "Shifts Completed" -> "shifts_completed"; "Jane Doe" -> "jane_doe". */
function slug_(text) {
  var s = String(text == null ? '' : text).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s || 'item';
}

function uniqueKey_(base, used) {
  var k = base, i = 2;
  while (used[k]) k = base + '_' + (i++);
  return k;
}

/**
 * Close variants of a metric type that people type or paste, mapped to the canonical rule.
 * Case, spaces, hyphens, punctuation and a trailing "s" are forgiven; the plain phrases of the dropdown
 * and the aliases below cover the obvious near-misses.
 */
var TYPE_ALIASES = {
  shifts_completed: ['shifts_complete', 'shift_completed', 'shift_complete', 'completed_shifts', 'completed', 'shifts_done', 'done'],
  shifts_scheduled: ['shift_scheduled', 'scheduled_shifts', 'scheduled', 'shifts_sched', 'sched', 'commitments'],
  shifts_flaked: ['shift_flaked', 'flaked_shifts', 'flaked', 'flakes', 'flake', 'no_show', 'no_shows', 'noshow', 'noshows', 'shifts_no_show'],
  active_volunteers: ['active_volunteer', 'active_vols', 'active', 'people_who_completed_a_shift'],
  new_volunteers: ['new_volunteer', 'new_vols', 'new', 'first_shift', 'first_shifts'],
  survey_first_response: ['first_response', 'survey_first', 'first', 'first_answer', 'first_answered'],
  survey_current_response: ['current_response', 'survey_current', 'current', 'latest_response', 'latest', 'current_answer', 'current_answer_is'],
  external: ['warehouse', 'fed_from_outside', 'outside', 'phoenix', 'bigquery', 'civis', 'portal', 'raw']
};

function typeKey_(text) {
  return String(text == null ? '' : text).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** The canonical metric type for what someone typed or picked, or null if it matches nothing. */
function normalizeType(text) {
  var t = typeKey_(text);
  if (!t) return null;
  var types = metricTypes_();
  if (types.indexOf(t) >= 0) return t;
  for (var i = 0; i < types.length; i++) {
    var canon = types[i], aliases = (TYPE_ALIASES[canon] || []).concat([typeKey_(TYPE_PHRASES[canon])]);
    if (aliases.indexOf(t) >= 0 || aliases.indexOf(t.replace(/s$/, '')) >= 0 || canon.replace(/s$/, '') === t.replace(/s$/, '')) return canon;
  }
  return null;
}

function splitList_(cell) {
  return String(cell || '').split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
}

/**
 * People in "Their name in VAN". Separated by semicolons or line breaks when any are present
 * (so "Doe, Jane; Smith, Pat" works as VAN writes names), otherwise by commas
 * ("jdoe, mlee" or "Jane Doe, Pat Smith").
 */
function splitPeople_(cell) {
  var s = String(cell || '');
  var sep = /[;\n]/.test(s) ? /[;\n]/ : ',';
  var parts = s.split(sep).map(function (x) { return x.trim(); }).filter(Boolean);
  // "Doe, Jane" with no semicolon: two single capitalized words around one comma is one person, not two usernames.
  if (sep === ',' && parts.length === 2 && parts.every(function (p) { return /^[A-Z][^\s,]*$/.test(p); })) return [parts.join(', ')];
  return parts;
}

/** Sheet date (Date object or text) -> 'yyyy-MM-dd'. */
function toDay_(v, label, timezone) {
  if (typeof v === 'number' && v > 20000 && v < 80000) v = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);   // a Sheets serial date shown as a number
  var day = v instanceof Date ? dateToDay_(v, timezone) : toDay(v);
  if (!day) throw new Error('Setup, Settings: "' + label + '" must be a date written yyyy-mm-dd, e.g. 2026-10-05.');
  return day;
}

/** Cell dates are midnight in the spreadsheet's timezone; format in that same zone. */
function dateToDay_(d, timezone) {
  if (typeof Utilities !== 'undefined') return Utilities.formatDate(d, timezone || SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return d.toISOString().slice(0, 10);
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

if (typeof module !== 'undefined') {
  if (typeof SHIFT_TYPES === 'undefined') { var M_ = require('./Metrics.js'); var SHIFT_TYPES = M_.SHIFT_TYPES, isShiftMetric = M_.isShiftMetric, toDay = M_.toDay, computeWeeks = M_.computeWeeks; }   // Apps Script shares globals; Node does not
  module.exports = { parseSetup: parseSetup, splitList_: splitList_, splitPeople_: splitPeople_, normalizeType: normalizeType, metricTypes_: metricTypes_, typePhrases_: typePhrases_, slug_: slug_, TYPE_PHRASES: TYPE_PHRASES, GROUP_HEADERS: GROUP_HEADERS, METRIC_HEADERS: METRIC_HEADERS };
}
