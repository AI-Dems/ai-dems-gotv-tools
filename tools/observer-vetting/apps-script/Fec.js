/**
 * Fec.js — turning a person's FEC individual-contribution records into a
 * verdict (Dem donor / Rep donor / Mixed / Other only / No history) and a
 * confidence in the identity match. Pure; tested in Node.
 *
 * Records come from the openFEC schedule_a endpoint, fetched by name + state
 * (Api.js) and cached. Narrowing to the person's zip and street happens here,
 * so re-running against an edited address never needs a new fetch.
 */

var ACTBLUE = 'C00401224', WINRED = 'C00694323';

/** Default committee-name keywords for PACs and joint fundraisers the FEC leaves party-less. The Committees tab is seeded from these. */
var DEFAULT_COMMITTEE_KEYWORDS = [
  ['DEMOCRATIC PARTY', 'DEM'], ['DEMOCRATIC NATIONAL', 'DEM'], ['DEMOCRATIC SENATORIAL', 'DEM'],
  ['DEMOCRATIC CONGRESSIONAL', 'DEM'], ['DSCC', 'DEM'], ['DCCC', 'DEM'], ['HARRIS VICTORY', 'DEM'],
  ['HARRIS FOR PRESIDENT', 'DEM'], ['BIDEN VICTORY', 'DEM'], ['BIDEN FOR PRESIDENT', 'DEM'],
  ["EMILY'S LIST", 'DEM'], ['EMILYS LIST', 'DEM'], ['STOP REPUBLICANS', 'DEM'],
  ['REPUBLICAN PARTY', 'REP'], ['REPUBLICAN NATIONAL', 'REP'], ['NRCC', 'REP'], ['NRSC', 'REP'],
  ['TRUMP', 'REP'], ['NEVER SURRENDER', 'REP'], ['MAGA', 'REP'], ['SAVE AMERICA', 'REP']
];

var STRONG_MATCHES = { 'Strong (street)': 1, 'Medium (zip, no street on file)': 1 };

function committeeName_(d) {
  return String((d.committee && d.committee.name) || d.committee_name || '').toUpperCase();
}

/** DEM, REP or OTHER. keywords: [[text, party], ...] from the Committees tab. */
function partyOf(d, keywords) {
  if (d.committee_id === ACTBLUE) return 'DEM';
  if (d.committee_id === WINRED) return 'REP';
  var party = String((d.committee && d.committee.party) || '').toUpperCase();
  if (party === 'DEM' || party === 'DFL') return 'DEM';
  if (party === 'REP') return 'REP';
  var name = committeeName_(d);
  for (var i = 0; i < keywords.length; i++) if (name.indexOf(keywords[i][0]) >= 0) return keywords[i][1];
  return 'OTHER';
}

/** Who the money went to: the earmark on a conduit gift, else the committee. */
function recipientOf(d) {
  if (d.committee_id === ACTBLUE || d.committee_id === WINRED) {
    var m = String(d.memo_text || '').toUpperCase().match(/EARMARKED FOR (.+?)\s*(\(C\d+\))?$/);
    if (m) return titleCase(m[1]);
  }
  return titleCase(committeeName_(d) || '?');
}

/** "LAST, FIRST M" → { last: [...], first: [...] }; first is empty when there is no comma. */
function splitFecName(d) {
  var name = String(d.contributor_name || '').toUpperCase(), comma = name.indexOf(',');
  return { last: norm(comma < 0 ? name : name.slice(0, comma)), first: norm(comma < 0 ? '' : name.slice(comma + 1)) };
}

/**
 * Same person if our last name's parts are all in theirs and the first names
 * share a prefix or are nicknames of each other (Mike gives as Michael).
 */
function isSameName(d, obs, nick) {
  var theirs = splitFecName(d), last = norm(obs.last), first = norm(obs.first);
  if (!last.length || !first.length || !theirs.first.length) return false;
  if (!last.every(function (t) { return theirs.last.indexOf(t) >= 0; })) return false;
  return theirs.first[0].indexOf(first[0]) === 0 || first[0].indexOf(theirs.first[0]) === 0 || sameFirst(first[0], theirs.first[0], nick);
}

function emptySummary() {
  return { verdict: '', match: '', dem: [0, 0], rep: [0, 0], other: 0, top: '', notes: [], nameDoubt: false, address: '' };
}

/**
 * Summarize one person's records. obs: { first, last, street, zip, state }.
 * rules: { nick, keywords }. Returns the fields the Vetting tab shows.
 */
function summarize(donations, obs, rules) {
  var matched = donations.filter(function (d) { return isSameName(d, obs, rules.nick); });

  // Conduit rows already count each earmarked gift, so drop the recipient's copy
  matched = matched.filter(function (d) {
    return d.committee_id === ACTBLUE || d.committee_id === WINRED || !/ACTBLUE|WINRED/.test(String(d.memo_text || '').toUpperCase());
  });

  // Narrow to the observer's street if possible, else their zip, else every name match
  var zip5 = String(obs.zip || '').slice(0, 5), myStreet = streetKey(obs.street);
  var atZip = matched.filter(function (d) { return zip5 && String(d.contributor_zip || '').slice(0, 5) === zip5; });
  var atStreet = atZip.filter(function (d) { return myStreet && streetKey(d.contributor_street_1) === myStreet; });
  var used = atStreet.length ? atStreet : atZip.length ? atZip : matched;

  var zips = {};
  matched.forEach(function (d) { var z = String(d.contributor_zip || '').slice(0, 5); if (z) zips[z] = true; });
  var addresses = counter_(used.map(function (d) {
    return titleCase(String(d.contributor_street_1 || '')) + ', ' + String(d.contributor_zip || '').slice(0, 5);
  }));

  var totals = { DEM: [0, 0], REP: [0, 0], OTHER: [0, 0] }, recips = [];
  used.forEach(function (d) {
    var p = partyOf(d, rules.keywords);
    totals[p][0] += Number(d.contribution_receipt_amount) || 0;
    totals[p][1] += 1;
    recips.push(recipientOf(d));
  });
  recips = counter_(recips);

  var dem = totals.DEM[1], rep = totals.REP[1], verdict;
  if (!used.length) verdict = 'No history';
  else if (dem && rep) verdict = 'Mixed';
  else if (rep) verdict = 'Rep donor';
  else if (dem) verdict = 'Dem donor';
  else verdict = 'Other only';

  var match;
  if (!used.length) match = '';
  else if (atStreet.length) match = 'Strong (street)';
  else if (atZip.length && myStreet) match = 'Medium (zip, street differs)';
  else if (atZip.length) match = 'Medium (zip, no street on file)';
  else match = obs.state ? 'Weak (name + state)' : 'Weak (name only)';

  // Loose first-name matches and Jr/Sr suffixes can mean a relative's donations
  var myFirst = norm(obs.first)[0] || '', theirFirsts = [], suffixed = false;
  used.forEach(function (d) {
    var tokens = splitFecName(d).first;
    suffixed = suffixed || hasSuffix(tokens);
    if (tokens.length && !sameFirst(myFirst, tokens[0], rules.nick)) theirFirsts.push(tokens[0]);
  });
  theirFirsts = counter_(theirFirsts);

  var notes = [];
  if (theirFirsts.length) notes.push('FEC first name differs (' + theirFirsts.slice(0, 3).map(function (e) { return titleCase(e[0]); }).join(', ') + '); may be a relative');
  if (suffixed) notes.push('FEC name has Jr/Sr suffix; may be a relative');
  if (Object.keys(zips).length >= 3) notes.push('FEC results span ' + Object.keys(zips).length + ' zips; may be several people');
  if (atStreet.length && atZip.length > atStreet.length) notes.push((atZip.length - atStreet.length) + ' same-name gifts at other streets in zip excluded');
  if (atZip.length && matched.length > atZip.length) notes.push((matched.length - atZip.length) + ' same-name gifts at other zips excluded');
  if (atZip.length && !atStreet.length && myStreet) notes.push('FEC street differs from pasted street; may have moved or be a different person');

  return {
    verdict: verdict, match: match, dem: totals.DEM, rep: totals.REP, other: totals.OTHER[0],
    top: recips.slice(0, 4).map(function (e) { return e[0] + ' (' + e[1] + ')'; }).join('; '),
    notes: notes, nameDoubt: theirFirsts.length > 0 || suffixed,
    address: addresses.slice(0, 2).map(function (e) { return e[0]; }).join('; ')
  };
}

/** Is this match confident enough to act on? With no street to compare, a zip match is the best evidence available. */
function isStrong(s) {
  return !!STRONG_MATCHES[s.match] && !s.nameDoubt;
}

/** The public FEC search page for this person, as a HYPERLINK formula. */
function fecLink(obs) {
  var url = 'https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=' + encodeURIComponent(obs.first + ' ' + obs.last);
  if (obs.state) url += '&contributor_state=' + encodeURIComponent(obs.state);
  return '=HYPERLINK("' + url + '","FEC Link")';
}

/* ---------- helpers ---------- */

/** [[value, count], ...] most common first; ties keep first-seen order, as Python's Counter does. */
function counter_(items) {
  var counts = {}, order = [];
  items.forEach(function (x) { if (!counts.hasOwnProperty(x)) { counts[x] = 0; order.push(x); } counts[x]++; });
  return order.map(function (x) { return [x, counts[x]]; }).sort(function (a, b) { return b[1] - a[1]; });
}

/** Python's str.title(): every run of letters capitalized, so "O'BRIEN" → "O'Brien". */
function titleCase(s) {
  return String(s || '').toLowerCase().replace(/[a-z]+/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1); });
}

if (typeof module !== 'undefined') {
  var N = require('./Names.js');
  norm = N.norm; sameFirst = N.sameFirst; streetKey = N.streetKey; hasSuffix = N.hasSuffix;
  module.exports = {
    ACTBLUE: ACTBLUE, WINRED: WINRED, DEFAULT_COMMITTEE_KEYWORDS: DEFAULT_COMMITTEE_KEYWORDS, partyOf: partyOf,
    recipientOf: recipientOf, isSameName: isSameName, summarize: summarize, emptySummary: emptySummary, isStrong: isStrong,
    fecLink: fecLink, titleCase: titleCase
  };
}
