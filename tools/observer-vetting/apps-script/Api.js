/**
 * Api.js — the openFEC schedule_a endpoint and the API key.
 *
 * The key lives in script properties (set through the menu), never in a cell.
 * One person = one query by name + state across the cycles on Setup, up to
 * MAX_PAGES pages of 100. Only the fields the rules use are kept.
 */

var FEC_URL = 'https://api.open.fec.gov/v1/schedules/schedule_a/';
var FEC_KEY_PROP = 'FEC_API_KEY';
var MAX_PAGES = 5;
var KEEP_FIELDS = ['contributor_name', 'contributor_street_1', 'contributor_zip', 'committee_id', 'committee_name', 'memo_text', 'contribution_receipt_amount'];

function getFecKey_() {
  return PropertiesService.getScriptProperties().getProperty(FEC_KEY_PROP) || '';
}

/** Menu: prompt for the key and save it. */
function setFecKey() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('FEC API key', 'Paste the key from https://api.open.fec.gov/developers/ (free; arrives by email in a minute).\n\nIt is stored with the script, not in any cell.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = res.getResponseText().trim();
  if (!key) { ui.alert('No key entered.'); return; }
  PropertiesService.getScriptProperties().setProperty(FEC_KEY_PROP, key);
  try {
    fetchPage_(key, [['per_page', '1'], ['two_year_transaction_period', '2024']]);
    ui.alert('Key saved and working.');
  } catch (err) {
    ui.alert('Key saved, but a test request failed:\n\n' + err.message);
  }
}

/** All of one person's records, trimmed to KEEP_FIELDS. Sleeps cfg.requestGap between pages. */
function fetchDonations_(key, obs, cfg) {
  var params = [
    ['contributor_name', obs.first + ' ' + obs.last], ['is_individual', 'true'], ['per_page', '100'], ['sort', '-contribution_receipt_date']
  ].concat(cfg.cycles.map(function (c) { return ['two_year_transaction_period', String(c)]; }));
  if (obs.state) params.push(['contributor_state', obs.state]);

  var results = [], last = {};
  for (var page = 0; page < MAX_PAGES; page++) {
    var body = fetchPage_(key, params.concat(Object.keys(last).map(function (k) { return [k, String(last[k])]; })));
    Utilities.sleep(cfg.requestGap * 1000);
    var rows = body.results || [];
    rows.forEach(function (d) { results.push(trim_(d)); });
    last = (body.pagination && body.pagination.last_indexes) || {};
    if (!Object.keys(last).length || rows.length < 100) break;
  }
  return results;
}

function trim_(d) {
  var out = {};
  KEEP_FIELDS.forEach(function (f) { if (d[f] != null) out[f] = d[f]; });
  if (d.committee) out.committee = { name: d.committee.name || '', party: d.committee.party || '' };
  return out;
}

/** One GET with retries on rate limits and server errors. */
function fetchPage_(key, params) {
  var url = FEC_URL + '?' + params.concat([['api_key', key]]).map(function (p) { return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]); }).join('&');
  var err = '';
  for (var attempt = 0; attempt < 4; attempt++) {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var code = resp.getResponseCode();
    if (code === 200) return JSON.parse(resp.getContentText());
    err = 'FEC returned HTTP ' + code + ': ' + resp.getContentText().slice(0, 200);
    if (code === 403 || code === 401) throw new Error(err + '\n\nIs the API key right? Observer Vetting → Set FEC API key.');
    if (code !== 429 && code < 500) throw new Error(err);
    Utilities.sleep(Math.min(20000 * (attempt + 1), 60000));
  }
  throw new Error(err);
}
