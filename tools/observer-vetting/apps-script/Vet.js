/**
 * Vet.js — the vetting rules and the rows of the Vetting tab. Pure; tested in Node.
 *
 * Each observer takes one path:
 *   Voter file      pasted with voter-file columns → Pass if registered with a
 *                   Democratic party label or support score above the threshold, else Flag
 *   In state        home-state address but no voter-file match → Review (FEC shown for context)
 *   Out of state    FEC donations decide
 *   No address      Review (FEC shown for context)
 *
 * Statuses: Pass, Review (a person checks; Notes says why), Flag (evidence against),
 * Pending (FEC lookup not done yet).
 */

var PATH = { VF: 'Voter file', IN_STATE: 'In state, no voter file match', OUT: 'Out of state', NONE: 'No address' };

var HEADER = [
  'Vetted', 'Status', 'Path', 'ID', 'Last', 'First', 'City', 'State', 'Zip', 'Email', 'Phone',
  'VF Party', 'Support Score', 'Served Before', 'Dem $', 'Dem Gifts', 'Rep $', 'Rep Gifts', 'Other $',
  'Top Recipients', 'FEC Match', 'FEC Address', 'FEC Link', 'Notes'
];

var PII_COLUMNS = { ID: 1, Last: 1, First: 1, City: 1, Zip: 1, Email: 1, Phone: 1, 'FEC Address': 1, 'FEC Link': 1 };

function pathFor(obs, cfg) {
  if (obs.inVoterFile) return PATH.VF;
  if (!obs.state) return PATH.NONE;
  if (obs.state === cfg.homeState) return PATH.IN_STATE;
  return PATH.OUT;
}

/** Stable key for one observer across rebuilds: the pasted ID, else name + zip. */
function rowKey(obs) {
  return obs.id ? String(obs.id) : nameKey(obs.first, obs.last) + '|' + String(obs.zip || '').slice(0, 5);
}

/** Key for the FEC cache: exactly the query Api.js sends. */
function fecKey(obs) {
  return norm(obs.first).join(' ') + ' ' + norm(obs.last).join(' ') + '|' + (obs.state || '');
}

function isDemParty(party, cfg) {
  return cfg.demParties.indexOf(String(party || '').trim().toUpperCase()) >= 0;
}

function statusFor(path, obs, s, cfg, rules) {
  if (path === PATH.VF) {
    if (voterFileNameProblem(obs, rules.nick)) return 'Review';
    var score = Number(obs.supportScore);
    return isDemParty(obs.vfParty, cfg) || (score > cfg.threshold) ? 'Pass' : 'Flag';
  }
  if (!s) return 'Pending';
  if (s.verdict === 'Rep donor') return isStrong(s) ? 'Flag' : 'Review';
  if (path === PATH.OUT && s.verdict === 'Dem donor' && isStrong(s)) return 'Pass';
  return 'Review';
}

function phoneFmt(p) {
  var digits = String(p || '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6) : String(p || '');
}

/**
 * One Vetting row per observer.
 *   observers  from the observers tab (Config.readObservers)
 *   cache      fecKey → array of FEC records, or undefined if not fetched yet
 *   served     { nameKey: true } from the prior_observers tab
 *   vetted     { rowKey: initials } preserved from the current Vetting tab
 *   cfg        { homeState, threshold, demParties }
 *   rules      { nick, keywords }
 * Returns { rows (with HEADER first), counts: { status: n }, pending: n }.
 */
function buildRows(observers, cache, served, vetted, cfg, rules) {
  var counts = {}, pending = 0;
  var rows = observers.map(function (obs) {
    var path = pathFor(obs, cfg), key = rowKey(obs);
    var records = path === PATH.VF ? null : cache[fecKey(obs)];
    var s = path === PATH.VF ? emptySummary() : records ? summarize(records, obs, rules) : null;
    var status = statusFor(path, obs, s, cfg, rules);
    if (status === 'Pending') pending++;
    counts[status] = (counts[status] || 0) + 1;
    s = s || emptySummary();

    var notes = s.notes.slice();
    if (path === PATH.VF) {
      var problem = voterFileNameProblem(obs, rules.nick);
      if (problem) notes.unshift(problem);
      if (obs.state && obs.state !== cfg.homeState) notes.unshift('Address in ' + obs.state + '; matched to ' + cfg.homeState + ' voter file');
    }
    if (path === PATH.IN_STATE || path === PATH.NONE) notes.unshift('Manual review: ' + path.toLowerCase());
    if (s.verdict) notes.unshift('FEC: ' + s.verdict);
    if (status === 'Pending') notes.unshift('FEC lookup pending');

    var score = obs.supportScore === '' || obs.supportScore == null ? '' : Number(obs.supportScore);
    return [
      vetted[key] || '', status, path, obs.id || '', obs.last, obs.first, obs.city, obs.state, String(obs.zip || ''),
      obs.email, phoneFmt(obs.phone), obs.vfParty, isNaN(score) ? '' : score,
      served[nameKey(obs.first, obs.last)] ? 'Yes (name match)' : '',
      s.dem[1] ? Math.round(s.dem[0]) : '', s.dem[1] || '', s.rep[1] ? Math.round(s.rep[0]) : '', s.rep[1] || '',
      s.other ? Math.round(s.other) : '',
      s.top, s.match, s.address, records ? fecLink(obs) : '', notes.join('; '),
      key
    ];
  });
  return { rows: [HEADER.concat(['row_key'])].concat(rows), counts: counts, pending: pending };
}

/** Blank out personal columns and strip quoted names from Notes, for a copy shared outside the team. */
function redactRow(row) {
  return row.map(function (value, i) {
    var col = HEADER[i];
    if (col === undefined) return '';
    if (PII_COLUMNS[col] && value !== '') return '[REDACTED]';
    if (col === 'Notes') {
      return String(value).replace(/Voter file record is [^;]*/g, 'Voter file name differs from pasted name')
        .replace(/FEC first name differs \([^)]*\)/g, 'FEC first name differs');
    }
    return value;
  });
}

if (typeof module !== 'undefined') {
  var N = require('./Names.js'), F = require('./Fec.js');
  norm = N.norm; nameKey = N.nameKey; voterFileNameProblem = N.voterFileNameProblem;
  summarize = F.summarize; emptySummary = F.emptySummary; isStrong = F.isStrong; fecLink = F.fecLink;
  module.exports = { PATH: PATH, HEADER: HEADER, pathFor: pathFor, rowKey: rowKey, fecKey: fecKey, statusFor: statusFor, phoneFmt: phoneFmt, buildRows: buildRows, redactRow: redactRow };
}
