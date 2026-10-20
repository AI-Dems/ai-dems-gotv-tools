/**
 * Config.js — reads the Setup, observers, Nicknames, Committees and
 * prior_observers tabs into plain objects.
 *
 * Setup is label/value pairs in columns A/B, found by label so order does not
 * matter. Columns D/E of Setup hold status written by the tool.
 */

var SETUP_TAB = 'Setup', OBSERVERS_TAB = 'observers', NICKNAMES_TAB = 'Nicknames', COMMITTEES_TAB = 'Committees', PRIOR_TAB = 'prior_observers';

var SETTINGS = [
  // [label, key, default, note]
  ['Home state', 'homeState', '', 'Two-letter state, e.g. NH. People with an address here but no voter-file columns go to Review; everyone else out of state is vetted on FEC donations.'],
  ['Support score threshold', 'threshold', '0.5', 'On the voter-file path, a support score above this passes even without a Democratic registration. Scores are 0–1 (divide by 100 if yours are 0–100).'],
  ['Democratic party labels', 'demParties', 'Democratic, DEM, D, DFL', 'Comma-separated. A voter_file_party value matching any of these (ignoring case) counts as a registered Democrat.'],
  ['Search FEC gifts since (year)', 'sinceYear', '2016', 'Donations from this election cycle onward are counted. Earlier gifts are ignored.'],
  ['Seconds between FEC requests', 'requestGap', '3.7', 'A free FEC key allows 1,000 requests per hour; 3.7 seconds keeps under it. Lower only if FEC raised your limit.']
];

function readConfig() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SETUP_TAB);
  if (!sheet) throw new Error('No "' + SETUP_TAB + '" tab. Run Observer Vetting → Build sheet first.');
  var raw = {};
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getDisplayValues().forEach(function (row) {
    SETTINGS.forEach(function (s) { if (row[0].trim() === s[0]) raw[s[1]] = row[1].trim(); });
  });
  var cfg = {};
  SETTINGS.forEach(function (s) { cfg[s[1]] = raw[s[1]] === undefined || raw[s[1]] === '' ? s[2] : raw[s[1]]; });
  cfg.homeState = cfg.homeState.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cfg.homeState)) throw new Error('Home state on Setup must be a two-letter state, e.g. NH (got "' + cfg.homeState + '")');
  cfg.threshold = Number(cfg.threshold);
  if (isNaN(cfg.threshold)) throw new Error('Support score threshold on Setup must be a number');
  cfg.demParties = cfg.demParties.split(',').map(function (p) { return p.trim().toUpperCase(); }).filter(Boolean);
  cfg.cycles = cyclesSince(Number(cfg.sinceYear) || 2016, new Date().getFullYear());
  cfg.requestGap = Number(cfg.requestGap) || 3.7;
  return cfg;
}

/** Even years (FEC two-year periods) from the cycle containing `since` through the current one. */
function cyclesSince(since, now) {
  var out = [];
  for (var y = since + (since % 2); y <= now + (now % 2); y += 2) out.push(y);
  return out;
}

/** Header → normalized key: "First Name", "first_name" and "FIRST NAME" are the same column. */
function headerKey_(h) {
  return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

var KNOWN_COLUMNS = {
  id: 'id', van_id: 'id', vanid: 'id', voter_id: 'id',
  first_name: 'first', first: 'first', firstname: 'first',
  last_name: 'last', last: 'last', lastname: 'last',
  street: 'street', address: 'street', street_address: 'street', address_1: 'street',
  city: 'city', town: 'city', state: 'state', zip: 'zip', zip_code: 'zip', zip5: 'zip', postal_code: 'zip',
  email: 'email', phone: 'phone', cell: 'phone', cell_phone: 'phone',
  voter_file_match: 'vfMatch', in_voter_file: 'vfMatch', on_voter_file: 'vfMatch',
  voter_file_party: 'vfParty', party: 'vfParty', registered_party: 'vfParty',
  support_score: 'supportScore', dem_support: 'supportScore', support: 'supportScore',
  voter_file_first_name: 'vfFirst', vf_first_name: 'vfFirst',
  voter_file_middle_name: 'vfMiddle', vf_middle_name: 'vfMiddle',
  voter_file_last_name: 'vfLast', vf_last_name: 'vfLast'
};

function truthy_(v) {
  return /^(y|yes|true|1|x|t)$/i.test(String(v == null ? '' : v).trim());
}

/**
 * Rows of the observers tab as objects (see docs/data-contract.md).
 * Throws when first_name or last_name is missing.
 */
function readObservers() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(OBSERVERS_TAB);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('The "' + OBSERVERS_TAB + '" tab is empty. Paste your observers in (see docs/data-contract.md).');
  var values = sheet.getDataRange().getDisplayValues();
  var fields = values[0].map(function (h) { return KNOWN_COLUMNS[headerKey_(h)] || null; });
  ['first', 'last'].forEach(function (f) {
    if (fields.indexOf(f) < 0) throw new Error('The observers tab needs a column named ' + f + '_name');
  });
  var hasMatchCol = fields.indexOf('vfMatch') >= 0;
  var out = [];
  values.slice(1).forEach(function (row) {
    var obs = { id: '', first: '', last: '', street: '', city: '', state: '', zip: '', email: '', phone: '', vfMatch: '', vfParty: '', supportScore: '', vfFirst: '', vfMiddle: '', vfLast: '' };
    row.forEach(function (v, i) { if (fields[i]) obs[fields[i]] = String(v).trim(); });
    if (!obs.first && !obs.last) return;
    obs.state = obs.state.toUpperCase();
    obs.zip = obs.zip.replace(/\D/g, '').slice(0, 5);
    if (obs.zip.length && obs.zip.length < 5) obs.zip = ('00000' + obs.zip).slice(-5);   // Excel ate the leading zero
    if (!obs.vfFirst && !obs.vfLast) { obs.vfFirst = obs.first; obs.vfLast = obs.last; }   // no voter-file name pasted: nothing to compare
    // Pasted voter-file columns mean the person is on your voter file, unless a voter_file_match column says otherwise
    obs.inVoterFile = hasMatchCol ? truthy_(obs.vfMatch) : !!(obs.vfParty || obs.supportScore);
    out.push(obs);
  });
  if (!out.length) throw new Error('The observers tab has no rows with a name.');
  return out;
}

/** Nickname groups (one per row, names separated by spaces or commas) and committee keywords, with defaults when a tab is empty. */
function readRules() {
  var ss = SpreadsheetApp.getActive();
  var nicks = ss.getSheetByName(NICKNAMES_TAB), groups = [];
  if (nicks && nicks.getLastRow() > 1) {
    nicks.getRange(2, 1, nicks.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) { if (r[0].trim()) groups.push(r[0]); });
  }
  var cmte = ss.getSheetByName(COMMITTEES_TAB), keywords = [];
  if (cmte && cmte.getLastRow() > 1) {
    cmte.getRange(2, 1, cmte.getLastRow() - 1, 2).getDisplayValues().forEach(function (r) {
      var party = r[1].trim().toUpperCase();
      if (r[0].trim() && (party === 'DEM' || party === 'REP')) keywords.push([r[0].trim().toUpperCase(), party]);
    });
  }
  return {
    nick: nicknameIndex(groups.length ? groups : DEFAULT_NICKNAME_GROUPS),
    keywords: keywords.length ? keywords : DEFAULT_COMMITTEE_KEYWORDS
  };
}

/** { nameKey: true } for everyone on the prior_observers tab. */
function readPrior() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(PRIOR_TAB), out = {};
  if (!sheet || sheet.getLastRow() < 2) return out;
  var values = sheet.getDataRange().getDisplayValues();
  var fields = values[0].map(function (h) { return KNOWN_COLUMNS[headerKey_(h)] || null; });
  var fi = fields.indexOf('first'), li = fields.indexOf('last');
  if (fi < 0 || li < 0) return out;
  values.slice(1).forEach(function (r) { if (r[fi] || r[li]) out[nameKey(r[fi], r[li])] = true; });
  return out;
}
