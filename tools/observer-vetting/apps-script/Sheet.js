/**
 * Sheet.js — the tabs: README and Setup scaffolding, the Vetting tab, the
 * shareable redacted copy, status cells, and the log.
 *
 * Tabs
 *   README           instructions for humans
 *   Setup            campaign config (A/B) and status written by the tool (D/E)
 *   observers        the input (docs/data-contract.md); you paste this
 *   Vetting          one row per observer with Status, Path and Notes; Vetted is yours
 *   Nicknames        first names that count as the same person, one group per row
 *   Committees       keywords that assign a party to PACs the FEC leaves party-less
 *   prior_observers  optional: names who served before, for the Served Before column
 *   fec_cache        hidden: raw FEC lookups
 *   log              one line per run
 */

var LOG_TAB = 'log', README_TAB = 'README';
var COLORS = { header: '#1f3864', headerText: '#ffffff', band: '#d9e2f3', input: '#fffbe6', muted: '#999999' };
var STATUS_COLORS = { Pass: '#b7e1cd', Review: '#fff2cc', Flag: '#f4c7c3', Pending: '#eeeeee' };

/* ---------- Vetting tab ---------- */

/** Build (or rebuild) the Vetting tab. Hand-typed Vetted initials survive. */
function writeVetting_(observers, cache, served, cfg, rules) {
  var sheet = getOrCreate_(VETTING_TAB);
  var built = buildRows(observers, cache, served, readVetted_(sheet), cfg, rules);
  var rows = built.rows, width = rows[0].length;
  sheet.clear();
  sheet.getRange(1, 1, rows.length, width).setValues(rows);
  formatVetting_(sheet, rows.length, width);
  return built;
}

/** Existing Vetted values keyed by row_key, so a rebuild never loses them. */
function readVetted_(sheet) {
  var out = {};
  if (sheet.getLastRow() < 2) return out;
  var v = sheet.getDataRange().getValues();
  var vc = v[0].indexOf('Vetted'), kc = v[0].indexOf('row_key');
  if (vc < 0 || kc < 0) return out;
  v.slice(1).forEach(function (row) { if (row[kc] && row[vc] !== '') out[String(row[kc])] = row[vc]; });
  return out;
}

function formatVetting_(sheet, rows, width) {
  var c = {};
  HEADER.forEach(function (h, i) { c[h] = i + 1; });
  sheet.getRange(1, 1, 1, width).setBackground(COLORS.header).setFontColor(COLORS.headerText).setFontWeight('bold').setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(3);
  sheet.getRange(1, c.Zip, rows, 1).setNumberFormat('@');
  if (rows > 1) {
    var n = rows - 1;
    sheet.getRange(2, c.Vetted, n, 1).setBackground(COLORS.input);
    sheet.getRange(2, c['Support Score'], n, 1).setNumberFormat('0.000');
    [c['Dem $'], c['Rep $'], c['Other $']].forEach(function (col) { sheet.getRange(2, col, n, 1).setNumberFormat('$#,##0'); });
    var statusRange = sheet.getRange(2, c.Status, n, 1);
    sheet.setConditionalFormatRules(Object.keys(STATUS_COLORS).map(function (s) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(STATUS_COLORS[s]).setRanges([statusRange]).build();
    }));
  }
  sheet.getRange(1, c.Vetted).setNote('Type your initials once you have looked at a row. Kept when the tab is rebuilt.');
  sheet.getRange(1, c.Status).setNote('Pass: meets the rule with a confident match. Review: a person checks; Notes says why. Flag: evidence against. Pending: FEC lookup not done yet. See docs/statuses.md.');
  sheet.getRange(1, c.Path).setNote('Which rule applied: voter-file columns, or FEC donations for everyone else.');
  sheet.getRange(1, c['FEC Match']).setNote('How confidently the FEC records were tied to this person: by street, by zip, or by name only.');
  sheet.setColumnWidth(c['Top Recipients'], 260);
  sheet.setColumnWidth(c.Notes, 420);
  sheet.hideColumns(width);
}

/* ---------- shareable copy ---------- */

/** Menu: a new spreadsheet with only the Vetting rows, personal columns redacted. */
function makeShareableCopy() {
  var ui = SpreadsheetApp.getUi();
  var src = SpreadsheetApp.getActive().getSheetByName(VETTING_TAB);
  if (!src || src.getLastRow() < 2) { ui.alert('No Vetting tab yet. Run Observer Vetting → Vet observers first.'); return; }
  var rows = src.getDataRange().getValues();
  var out = [HEADER].concat(rows.slice(1).map(function (r) { return redactRow(r.slice(0, HEADER.length)); }));
  var copy = SpreadsheetApp.create(SpreadsheetApp.getActive().getName() + ' (redacted ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + ')');
  var sheet = copy.getSheets()[0].setName(VETTING_TAB);
  sheet.getRange(1, 1, out.length, HEADER.length).setValues(out);
  sheet.getRange(1, 1, 1, HEADER.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  log_('ok', 'Redacted copy: ' + copy.getUrl());
  ui.showModalDialog(HtmlService.createHtmlOutput('<div style="font:14px/1.5 Arial,sans-serif"><p>Redacted copy saved to your Drive:</p><p><a target="_blank" href="' + copy.getUrl() + '">' + copy.getName() + '</a></p><p>Names, IDs, addresses, emails and phones are replaced with [REDACTED]. Status, Path, state, party, score, donation totals and notes are kept.</p></div>').setWidth(480).setHeight(200), 'Shareable copy');
}

/* ---------- status + log ---------- */

var STATUS_COL = 4, STATUS_ROWS = 20;

/** Write label/value pairs into the status area of Setup (columns D/E), keeping other labels. */
function setStatus_(pairs) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SETUP_TAB);
  if (!sheet) return;
  var range = sheet.getRange(1, STATUS_COL, STATUS_ROWS, 2);
  var v = range.getValues();
  if (v[0][0] !== 'Status') v[0] = ['Status', ''];
  Object.keys(pairs).forEach(function (label) {
    var r = -1;
    for (var i = 1; i < v.length; i++) if (v[i][0] === label) { r = i; break; }
    if (r < 0) for (var j = 1; j < v.length; j++) if (v[j][0] === '') { r = j; break; }
    if (r >= 0) v[r] = [label, pairs[label]];
  });
  range.setValues(v);
  sheet.getRange(1, STATUS_COL).setFontWeight('bold').setFontSize(12);
}

function log_(status, message) {
  var sheet = getOrCreate_(LOG_TAB);
  if (sheet.getLastRow() === 0) sheet.appendRow(['time', 'status', 'message']).setFrozenRows(1);
  sheet.appendRow([new Date(), status, message]);
  if (sheet.getLastRow() > 1000) sheet.deleteRows(2, 200);
}

/* ---------- scaffolding ---------- */

function buildSetup_() {
  var sheet = getOrCreate_(SETUP_TAB);
  if (sheet.getLastRow() > 0) return false;   // never overwrite a filled-in Setup
  var rows = [['Setting', 'Value']].concat(SETTINGS.map(function (s) { return [s[0], s[2]]; }));
  sheet.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
  SETTINGS.forEach(function (s, i) { if (s[3]) sheet.getRange(i + 2, 1).setNote(s[3]); });
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground(COLORS.band);
  sheet.getRange(2, 2, rows.length - 1, 1).setBackground(COLORS.input);
  sheet.getRange(1, STATUS_COL).setValue('Status').setFontWeight('bold').setFontSize(12);
  sheet.setColumnWidth(1, 240); sheet.setColumnWidth(2, 300); sheet.setColumnWidth(3, 30);
  sheet.setColumnWidth(STATUS_COL, 160); sheet.setColumnWidth(STATUS_COL + 1, 420);
  return true;
}

function buildObservers_() {
  var sheet = getOrCreate_(OBSERVERS_TAB);
  if (sheet.getLastRow() > 0) return false;
  var rows = [
    ['id', 'first_name', 'last_name', 'street', 'city', 'state', 'zip', 'email', 'phone', 'voter_file_party', 'support_score', 'voter_file_first_name', 'voter_file_last_name'],
    ['100001', 'Maria', 'Lopez', '4 Pleasant St', 'Concord', 'NH', '03301', '', '', 'Democratic', '0.91', 'Maria', 'Lopez'],
    ['100002', 'Bob', 'Tanaka', '18 School St', 'Keene', 'NH', '03431', '', '', 'Undeclared', '0.64', 'Robert', 'Tanaka'],
    ['100003', 'Janet', 'Okafor', '12 Elm St', 'Burlington', 'VT', '05401', '', '', '', '', '', ''],
    ['100004', 'Evan', 'Burke', '3 Mill St', 'Keene', 'NH', '03431', '', '', '', '', '', '']
  ];
  sheet.getRange(1, 1, rows.length, rows[0].length).setNumberFormat('@').setValues(rows);
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setBackground(COLORS.band);
  sheet.getRange(1, 1).setNote('SAMPLE DATA. Replace everything below row 1 with your observers. Columns are read by name: first_name and last_name are required; street, city, state, zip make FEC matching confident; fill voter_file_party, support_score and the voter_file_*_name columns only for people on your voter file. See docs/data-contract.md.');
  sheet.setFrozenRows(1);
  return true;
}

function buildNicknames_() {
  var sheet = getOrCreate_(NICKNAMES_TAB);
  if (sheet.getLastRow() > 0) return false;
  var rows = [['names that are the same person']].concat(DEFAULT_NICKNAME_GROUPS.map(function (g) { return [g.split(' ').map(titleCase).join(', ')]; }));
  sheet.getRange(1, 1, rows.length, 1).setValues(rows);
  sheet.getRange(1, 1).setFontWeight('bold').setBackground(COLORS.band)
    .setNote('One group per row, separated by commas or spaces. A pasted first name and a voter-file or FEC first name in the same group count as the same person. Add a row when a real match lands in Review for a nickname. A missing nickname never causes a false Pass.');
  sheet.setColumnWidth(1, 520);
  return true;
}

function buildCommittees_() {
  var sheet = getOrCreate_(COMMITTEES_TAB);
  if (sheet.getLastRow() > 0) return false;
  var rows = [['committee name contains', 'party']].concat(DEFAULT_COMMITTEE_KEYWORDS.map(function (k) { return [titleCase(k[0]), k[1]]; }));
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground(COLORS.band);
  sheet.getRange(1, 1).setNote('The FEC leaves party blank on PACs and joint fundraising committees. A committee whose name contains this text (ignoring case) is counted for the party in column B (DEM or REP). Add your state party, your candidate\'s joint fundraiser, and the other side\'s.');
  sheet.setColumnWidth(1, 320);
  return true;
}

function buildPrior_() {
  var sheet = getOrCreate_(PRIOR_TAB);
  if (sheet.getLastRow() > 0) return false;
  sheet.getRange(1, 1, 1, 2).setValues([['first_name', 'last_name']]).setFontWeight('bold').setBackground(COLORS.band);
  sheet.getRange(1, 1).setNote('Optional. Paste the names of people who served as observers in a past cycle. Matching rows on Vetting get "Yes (name match)" in Served Before. Leave empty if you have no such list.');
  return true;
}

function buildReadme_() {
  var sheet = getOrCreate_(README_TAB);
  if (sheet.getLastRow() > 0) return;
  var lines = [
    ['Poll Observer Vetting'],
    [''],
    ['Checks a list of volunteer poll observers for signs they are not on our side, so the voter protection team knows who to look at more closely before assigning them. People on your voter file pass on party registration or support score. Everyone else is checked against public FEC donation records.'],
    [''],
    ['First-time setup'],
    ['1. Setup tab: set Home state. The other values have sensible defaults.'],
    ['2. Observer Vetting menu → Set FEC API key. Get a free key at https://api.open.fec.gov/developers/ (it arrives by email).'],
    ['3. Paste your observers into the observers tab, replacing the sample rows. first_name and last_name are required; street, city, state and zip make matches confident; fill the voter_file_* and support_score columns only for people on your voter file (export them from VAN or your warehouse). docs/data-contract.md has the details.'],
    ['4. Optional: paste past observers into prior_observers.'],
    ['5. Observer Vetting → Vet observers. FEC lookups take about 8 seconds per out-of-state person and continue on their own; Setup → Status shows progress. Rows still waiting say Pending.'],
    [''],
    ['Reading the Vetting tab'],
    ['• Pass: meets the rule with a confident identity match. Review: a person should look; Notes says why. Flag: evidence against (not a Democrat on the voter file, or a Republican-only donor with a confident match).'],
    ['• Type your initials in Vetted once you have looked at a row. They survive re-runs.'],
    ['• FEC Link opens the public FEC search for that name so you can see the records yourself.'],
    ['• Re-run Vet observers whenever the observers tab changes. Only new people are looked up.'],
    [''],
    ['Sharing'],
    ['• This sheet holds volunteers\' names and contact details. Share it only with the voter protection team, and delete it after the election.'],
    ['• Observer Vetting → Make shareable copy (redacted) writes a copy with names, IDs, addresses, emails and phones removed.'],
    [''],
    ['Full documentation: https://github.com/AI-Dems/ai-dems-gotv-tools/tree/main/tools/observer-vetting']
  ];
  sheet.getRange(1, 1, lines.length, 1).setValues(lines);
  sheet.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  [5, 12, 18].forEach(function (r) { sheet.getRange(r, 1).setFontWeight('bold'); });
  sheet.setColumnWidth(1, 900);
  sheet.getRange(1, 1, lines.length, 1).setWrap(true);
}

/* ---------- helpers ---------- */

function getOrCreate_(name) {
  var ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
