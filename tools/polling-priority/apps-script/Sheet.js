/**
 * Sheet.js — the tabs: README and Setup scaffolding, the Priority tab, status
 * cells, and the log.
 *
 * Tabs
 *   README        instructions for humans
 *   Setup         campaign config (A/B) and status written by the tool (D/E)
 *   locations     the input (docs/data-contract.md); you fill this
 *   Priority      one row per location, ranked by net vote gain; Tier Override is yours
 *   Line Reports  the live tab the runner feeds (Lines.js)
 *   Aliases       reported name → location, for places the matcher can't resolve
 *   log           one line per run or push
 */

var PRIORITY_TAB = 'Priority', LOG_TAB = 'log', README_TAB = 'README';
var COLORS = { header: '#1f3864', headerText: '#ffffff', band: '#d9e2f3', input: '#fffbe6', muted: '#999999' };
var TIER_COLORS = { 1: '#b7e1cd', 2: '#d9ead3', 3: '#fff2cc', 4: '#fce5cd', 5: '#f4c7c3' };

var PRIORITY_FIXED = ['Rank', 'Tier', 'Tier Override', 'Computed Tier', 'Net Vote Gain', 'Likely Supporters', 'Likely Voters',
  'Registered', 'Supporters Tier', 'Voters Tier', 'Voters Rank', 'Location', 'City', 'County', 'Address', 'Precincts'];
var KEY_HEADER = 'location_key';

/* ---------- Priority tab ---------- */

/** Compute and (re)write the Priority tab. Hand-typed overrides survive. */
function buildPriority_(cfg, locations) {
  var result = computePriority(locations, cfg.cutoffs);
  var sheet = getOrCreate_(PRIORITY_TAB);
  var overrides = readOverrides_(sheet);
  var headers = PRIORITY_FIXED.concat(locations.extraHeaders, [KEY_HEADER]);
  var keyCol = headers.length;
  var grid = [headers].concat(result.rows.map(function (r, i) {
    var row = i + 2;
    return [r.rank, '=IF(C' + row + '<>"",C' + row + ',D' + row + ')', overrides[r.key] || '', r.tier,
      round1_(r.nvg), round1_(r.likelySupporters), round1_(r.likelyVoters), r.registered,
      r.supportersTier, r.votersTier, r.votersRank, r.name, r.city, r.county, r.address, r.precincts]
      .concat(locations.extraHeaders.map(function (h) { return r.extras[h]; }), [r.key]);
  }));
  sheet.clear();
  sheet.getRange(1, 1, grid.length, headers.length).setValues(grid);
  formatPriority_(sheet, grid.length, headers.length, keyCol, cfg);
  var label = function (k) { return result.cutoffs[k].join(', ') + (result.auto[k] ? ' (automatic)' : ' (from Setup)'); };
  setStatus_({
    'Priority last computed': new Date(),
    'Locations': result.rows.length,
    'Net vote gain cutoffs used': label('nvg'),
    'Likely supporters cutoffs used': label('supporters'),
    'Likely voters cutoffs used': label('voters')
  });
  log_('ok', 'Priority: ' + result.rows.length + ' locations ranked. Net vote gain cutoffs ' + label('nvg'));
  return result;
}

/** Existing Tier Override values keyed by location_key, so a rebuild never loses them. */
function readOverrides_(sheet) {
  var out = {};
  if (sheet.getLastRow() < 2) return out;
  var v = sheet.getDataRange().getValues();
  var oc = v[0].indexOf('Tier Override'), kc = v[0].indexOf(KEY_HEADER);
  if (oc < 0 || kc < 0) return out;
  v.slice(1).forEach(function (row) { if (row[kc] && row[oc] !== '') out[row[kc]] = row[oc]; });
  return out;
}

function formatPriority_(sheet, rows, cols, keyCol, cfg) {
  sheet.getRange(1, 1, 1, cols).setBackground(COLORS.header).setFontColor(COLORS.headerText).setFontWeight('bold').setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  if (rows > 1) {
    sheet.getRange(2, 3, rows - 1, 1).setBackground(COLORS.input)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(1, 5).setAllowInvalid(false).setHelpText('A tier from 1 to 5, or blank for the computed tier').build());
    sheet.getRange(2, 5, rows - 1, 3).setNumberFormat('#,##0.0');
    sheet.getRange(2, 8, rows - 1, 1).setNumberFormat('#,##0');
    var tierRange = sheet.getRange(2, 2, rows - 1, 1);
    sheet.setConditionalFormatRules([1, 2, 3, 4, 5].map(function (t) {
      return SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(t).setBackground(TIER_COLORS[t]).setRanges([tierRange]).build();
    }));
  }
  sheet.getRange(1, 2).setNote('Deploy by this tier. 1 = shorter lines here gain us the most votes. It is your override when you typed one, otherwise the computed tier.');
  sheet.getRange(1, 3).setNote('Type 1–5 here to pin a location\'s tier. Clear it to go back to the computed tier. Overrides survive a recompute.');
  sheet.getRange(1, 5).setNote('2 × Likely Supporters − Likely Voters: ' + cfg.supportLabel + ' votes minus everyone else\'s among the voters expected to turn out here. See docs/metrics.md.');
  sheet.getRange(1, 6).setNote('Σ turnout × ' + cfg.supportLabel + ' score: expected votes for us.');
  sheet.getRange(1, 7).setNote('Σ turnout score: expected ballots cast here.');
  sheet.hideColumns(keyCol);
  sheet.setColumnWidth(12, 220);
  sheet.setColumnWidth(16, 260);
}

/** The Priority tab as { key: { rank, tier, nvg, likelyVoters } }, honoring overrides. */
function readPriority_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(PRIORITY_TAB);
  var out = {};
  if (!sheet || sheet.getLastRow() < 2) return out;
  var v = sheet.getDataRange().getValues();
  var c = {};
  v[0].forEach(function (h, i) { c[h] = i; });
  v.slice(1).forEach(function (row) {
    var key = row[c[KEY_HEADER]];
    if (key) out[key] = { rank: row[c['Rank']], tier: row[c['Tier']], nvg: row[c['Net Vote Gain']], likelyVoters: row[c['Likely Voters']] };
  });
  return out;
}

/* ---------- status + log ---------- */

var STATUS_COL = 4, STATUS_ROWS = 40;

/** Write label/value pairs into the status area of Setup (columns D/E), keeping other labels. */
function setStatus_(pairs) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SETUP_TAB);
  if (!sheet) return;
  var range = sheet.getRange(1, STATUS_COL, STATUS_ROWS, 2);
  var v = range.getValues();
  if (v[0][0] !== 'Status') { v[0] = ['Status', '']; }
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
  // Column C shows each setting's hint in plain sight; the hover note on A repeats it.
  var rows = [['Setting', 'Value', 'How to fill it in']].concat(SETTINGS.map(function (s) { return [s[0], s[2], s[3]]; }));
  sheet.getRange(1, 1, rows.length, 3).setNumberFormat('@').setValues(rows);
  SETTINGS.forEach(function (s, i) { if (s[3]) sheet.getRange(i + 2, 1).setNote(s[3]); });
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground(COLORS.band);
  sheet.getRange(2, 2, rows.length - 1, 1).setBackground(COLORS.input);
  sheet.getRange(2, 3, rows.length - 1, 1).setFontColor(COLORS.muted).setWrap(true);
  sheet.getRange(1, STATUS_COL).setValue('Status').setFontWeight('bold').setFontSize(12);
  sheet.setColumnWidth(1, 230); sheet.setColumnWidth(2, 300); sheet.setColumnWidth(3, 420);
  sheet.setColumnWidth(STATUS_COL, 230); sheet.setColumnWidth(STATUS_COL + 1, 420);
  return true;
}

function buildLocations_() {
  var sheet = getOrCreate_(LOCATIONS_TAB);
  if (sheet.getLastRow() > 0) return false;
  var rows = [
    ['location_name', 'city', 'likely_voters', 'likely_supporters', 'registered', 'precincts', 'address', 'county', 'Congressional District'],
    ['Pinkerton Academy', 'Derry', 6710.4, 2991.7, 14102, 'Derry Ward 1, Derry Ward 2, Derry Ward 3, Derry Ward 4', '5 Pinkerton St', 'Rockingham', '1'],
    ['Riverside Community Center', 'Springfield', 4120.0, 2650.2, 7980, 'Springfield Ward 1, Springfield Ward 2', '12 River Rd', 'Franklin', '2'],
    ['Town Hall', 'Bow', 1890.5, 980.1, 3500, 'Bow', '10 Grandview Rd', 'Merrimack', '2'],
    ['Lincoln Elementary', 'West Lebanon', 2210.0, 1402.6, 4300, 'Lebanon Ward 1', '1 School St', 'Grafton', '2'],
    ['Town Hall', 'Alton', 1500.2, 520.0, 3100, 'Alton', '1 Monument Sq', 'Belknap', '1']
  ];
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setBackground(COLORS.band);
  sheet.getRange(1, 1).setNote('SAMPLE DATA. Replace everything below row 1 with your own polling locations. Columns are read by name; extra columns (like Congressional District here) are carried through. See docs/data-contract.md.');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 220); sheet.setColumnWidth(6, 300);
  return true;
}

function buildAliases_() {
  var sheet = getOrCreate_(ALIASES_TAB);
  if (sheet.getLastRow() > 0) return false;
  sheet.getRange(1, 1, 2, 3).setValues([
    ['reported_as', 'location_name', 'city'],
    ['Pinkerton Academy Hackler Gymnasium (Derry, Rockingham)', 'Pinkerton Academy', 'Derry']
  ]);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground(COLORS.band);
  sheet.getRange(1, 1).setNote('When the Status area on Setup lists an unmatched location, paste its exact text here and type the location_name and city it belongs to (as written on the locations tab). Takes effect on the next push.');
  sheet.setColumnWidth(1, 420); sheet.setColumnWidth(2, 220);
  return true;
}

function buildReadme_() {
  var sheet = getOrCreate_(README_TAB);
  if (sheet.getLastRow() > 0) return;
  var lines = [
    ['Polling Location Priority + Line Tracker'],
    [''],
    ['Ranks polling locations by net vote gain (our expected votes minus everyone else\'s) so that line-warming volunteers go where long lines cost us the most, and shows live wait times next to that ranking on election day.'],
    [''],
    ['First-time setup'],
    ['1. Fill in the Setup tab (timezone, election date). Leave the tier cutoffs blank unless you want fixed ones.'],
    ['2. Paste your polling locations into the locations tab, replacing the sample rows. docs/data-contract.md says what the columns mean and how to produce them.'],
    ['3. Polling Priority menu → Recompute priority. The Priority tab appears, ranked. Type a number in Tier Override to pin a location.'],
    ['4. Polling Priority → Build Line Reports tab.'],
    ['5. If poll observers report wait times in LBJ: deploy the web app once (Extensions → Apps Script → Deploy → New deployment → Web app, execute as Me, access Anyone), then Polling Priority → Set up runner access, and follow runner/README.md on the laptop that will stay logged into LBJ.'],
    ['6. Polling Priority → Install snapshot trigger. Before election day, run Polling Priority → Check setup.'],
    [''],
    ['Election day'],
    ['• Line Reports re-sorts itself every push: longest lines first, then by priority rank. Green/yellow/red on Time Reported = under 1h / 1–2h / over 2h old.'],
    ['• At each snapshot time a "<h:mm> Report" tab freezes the live tab. Fill in Wait Time Accurate?, Volunteers Deployed and Notes there.'],
    ['• Setup → Status shows the last scrape and any LBJ location the tool could not match. Fix those on the Aliases tab.'],
    [''],
    ['Full documentation: https://github.com/AI-Dems/ai-dems-gotv-tools/tree/main/tools/polling-priority']
  ];
  sheet.getRange(1, 1, lines.length, 1).setValues(lines);
  sheet.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  [5, 13].forEach(function (r) { sheet.getRange(r, 1).setFontWeight('bold'); });
  sheet.setColumnWidth(1, 900);
  sheet.getRange(1, 1, lines.length, 1).setWrap(true);
}

/* ---------- helpers ---------- */

function getOrCreate_(name) {
  var ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function round1_(x) { return Math.round(Number(x) * 10) / 10; }
