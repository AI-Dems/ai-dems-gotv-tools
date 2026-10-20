/**
 * Config.js — reads the Setup, locations and Aliases tabs into plain objects.
 *
 * Setup is label/value pairs in columns A/B. Rows are found by label, so
 * order does not matter. Columns D/E of Setup hold status written by pushes.
 */

var SETUP_TAB = 'Setup', LOCATIONS_TAB = 'locations', ALIASES_TAB = 'Aliases';

var SETTINGS = [
  // [label, key, default, note]
  ['Campaign name', 'campaignName', 'My Campaign', ''],
  ['Timezone', 'timezone', 'America/New_York', 'Report times and snapshots use this. A tz database name, e.g. America/Chicago.'],
  ['Election date', 'electionDate', '', 'e.g. 2026-11-03 or Nov 3, 2026. Snapshot tabs are taken on this date only. Set it to today to run a drill.'],
  ['Support score describes', 'supportLabel', 'Dem support', 'Only a label, shown on the Priority tab, e.g. "Smith for Senate support".'],
  ['Net vote gain tier cutoffs', 'nvgCutoffs', '', 'Blank = automatic (natural breaks, rounded). Or four numbers high to low, e.g. 1000, 400, 0, -400.'],
  ['Likely supporters tier cutoffs', 'supportersCutoffs', '', 'Blank = automatic. Or four numbers high to low.'],
  ['Likely voters tier cutoffs', 'votersCutoffs', '', 'Blank = automatic. Or four numbers high to low.'],
  ['Snapshot times', 'snapshotTimes', '4:15 PM, 5:15 PM, 6:15 PM, 7:15 PM', 'Comma-separated. On election day a copy of Line Reports is frozen at each time as a "<h:mm> Report" tab.'],
  ['Scrape every (minutes)', 'everyMin', '5', 'How often the runner reads the line dashboard.'],
  ['LBJ election name', 'lbjElectionName', '', 'Optional. The runner refuses to scrape if LBJ is switched to a different election.']
];

function readConfig() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SETUP_TAB);
  if (!sheet) throw new Error('No "' + SETUP_TAB + '" tab. Run Polling Priority → Build sheet first.');
  var raw = {};
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getDisplayValues().forEach(function (row) {
    SETTINGS.forEach(function (s) { if (row[0].trim() === s[0]) raw[s[1]] = row[1].trim(); });
  });
  var cfg = {};
  SETTINGS.forEach(function (s) { cfg[s[1]] = raw[s[1]] === undefined || raw[s[1]] === '' ? s[2] : raw[s[1]]; });
  if (cfg.electionDate && !parseDay(cfg.electionDate)) throw new Error('Could not read the Election date on Setup ("' + cfg.electionDate + '"). Type it like 2026-11-03 or Nov 3, 2026.');
  cfg.electionDate = parseDay(cfg.electionDate);
  cfg.cutoffs = {
    nvg: parseCutoffs(cfg.nvgCutoffs),
    supporters: parseCutoffs(cfg.supportersCutoffs),
    voters: parseCutoffs(cfg.votersCutoffs)
  };
  cfg.snapshotTimes = parseTimes(cfg.snapshotTimes);
  cfg.everyMin = Number(cfg.everyMin) || 5;
  return cfg;
}

/** Header → normalized key: "Likely Voters" and "likely_voters" are the same column. */
function headerKey_(h) {
  return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

var KNOWN_COLUMNS = {
  location_name: 'name', location: 'name', polling_location: 'name',
  city: 'city', town: 'city', polling_city: 'city',
  county: 'county', address: 'address', precincts: 'precincts', precinct: 'precincts',
  registered: 'registered', registered_voters: 'registered',
  likely_voters: 'likelyVoters', likely_supporters: 'likelySupporters'
};

/**
 * Rows of the locations tab as objects (see docs/data-contract.md). Extra
 * columns land in `extras` keyed by their header text, in sheet order.
 * Throws when a required column is missing or a location is listed twice.
 */
function readLocations() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(LOCATIONS_TAB);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('The "' + LOCATIONS_TAB + '" tab is empty. Paste your polling locations in (see docs/data-contract.md).');
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(String);
  var fields = headers.map(function (h) { return KNOWN_COLUMNS[headerKey_(h)] || null; });
  ['name', 'likelyVoters', 'likelySupporters'].forEach(function (f) {
    if (fields.indexOf(f) < 0) throw new Error('The locations tab needs a column named ' + { name: 'location_name', likelyVoters: 'likely_voters', likelySupporters: 'likely_supporters' }[f]);
  });
  var extraCols = headers.map(function (h, i) { return fields[i] || !h.trim() ? -1 : i; }).filter(function (i) { return i >= 0; });
  var out = [], seen = {};
  values.slice(1).forEach(function (row, r) {
    var loc = { extras: {} };
    row.forEach(function (v, i) { if (fields[i]) loc[fields[i]] = v; });
    loc.name = String(loc.name || '').trim();
    if (!loc.name) return;
    loc.city = String(loc.city || '').trim();
    loc.county = String(loc.county || '').trim();
    loc.address = String(loc.address || '').trim();
    loc.precincts = String(loc.precincts || '').trim();
    loc.registered = loc.registered === '' || loc.registered == null ? '' : Number(loc.registered);
    loc.likelyVoters = Number(loc.likelyVoters) || 0;
    loc.likelySupporters = Number(loc.likelySupporters) || 0;
    loc.key = siteKey(loc.name, loc.city);
    extraCols.forEach(function (i) { loc.extras[headers[i].trim()] = row[i]; });
    if (seen[loc.key]) throw new Error('"' + loc.name + '" (' + loc.city + ') appears twice on the locations tab (rows ' + seen[loc.key] + ' and ' + (r + 2) + '). Merge them or add a city.');
    seen[loc.key] = r + 2;
    out.push(loc);
  });
  if (!out.length) throw new Error('The locations tab has no rows with a location_name.');
  out.extraHeaders = extraCols.map(function (i) { return headers[i].trim(); });
  return out;
}

/** The Aliases tab as { reportedText: locationKey }. Rows that point at an unknown location are ignored. */
function readAliases(locations) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(ALIASES_TAB);
  var out = {};
  if (!sheet || sheet.getLastRow() < 2) return out;
  var known = {};
  locations.forEach(function (l) { known[l.key] = true; });
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(function (row) {
    var reported = String(row[0] || '').trim(), key = siteKey(row[1], row[2]);
    if (reported && known[key]) out[reported] = key;
  });
  return out;
}
