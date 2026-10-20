/**
 * Match.js — matching a wait-time report to a row on the locations tab, and
 * ordering the live tab. Pure; tested in Node.
 *
 * A report names a place the way the reporting system does ("Pinkerton
 * Academy (Derry, Rockingham)" from LBJ, or a name + city from a form). The
 * locations tab names it the way the voter file does. Matching, in order:
 *
 *   1. alias      the Aliases tab, keyed by the exact reported text
 *   2. exact      name + city, after normalizing case, punctuation, and a
 *                 leading "Town of" / town name ("Gorham Town Hall" ≡ "Town Hall")
 *   3. name only  the name alone, when exactly one location in the whole tab has it
 *   4. ward       a trailing "- Ward N" is stripped and 2–3 retried, keeping a
 *                 location whose precincts mention that ward if several match
 *
 * Nothing semantic: the normalizer must never turn one place into another.
 */

/** Match key: case, punctuation and spacing vary between systems; words do not. */
function locationKey(name) {
  return String(name || '').toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[.,'’`"()\/\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** locationKey with a leading "TOWN OF " or the town's own name dropped. */
function placeKey(name, town) {
  var t = locationKey(town);
  var k = locationKey(name).replace(/^TOWN OF /, '').replace(/^CITY OF /, '');
  if (t && k.indexOf(t + ' ') === 0 && k.length > t.length + 1) k = k.slice(t.length + 1);
  return k;
}

/** Key for a locations row. Two rows with the same key are the same place. */
function siteKey(name, city) {
  return locationKey(name) + '|' + locationKey(city);
}

/** "Epping Middle/High School (O'Day Gym) (Epping, Rockingham)" → { name, town, county }. The LAST parenthetical is town + county. */
function parseTitle(title) {
  var m = String(title || '').trim().match(/^(.*\S)\s*\(([^(),]+),\s*([^(),]+)\)$/);
  if (m) return { name: m[1].trim(), town: m[2].trim(), county: m[3].trim() };
  var n = String(title || '').trim().match(/^(.*\S)\s*\(([^()]+)\)$/);
  return n ? { name: n[1].trim(), town: n[2].trim(), county: '' } : null;
}

var WARD_SUFFIX = /^(.*?)\s*[-–—]?\s*Ward\s*0*(\d+)\s*$/i;

/**
 * locations: rows with { key, name, city, precincts }.
 * aliases:   { reportedText: key }.
 * Returns match(report) → key or null, where report is { title } or { name, city }.
 */
function buildMatcher(locations, aliases) {
  aliases = aliases || {};
  var exact = {}, byName = {}, byKey = {};
  locations.forEach(function (loc) {
    byKey[loc.key] = loc;
    var towns = [loc.city];
    String(loc.precincts || '').split(',').forEach(function (p) {
      var t = p.replace(/\s*[-–—]?\s*Ward\s*\d+\s*$/i, '').trim();
      if (t && towns.indexOf(t) < 0) towns.push(t);
    });
    towns.forEach(function (town) {
      var k = placeKey(loc.name, town) + '|' + locationKey(town);
      if (!exact[k]) exact[k] = [];
      if (exact[k].indexOf(loc.key) < 0) exact[k].push(loc.key);
    });
    var nk = placeKey(loc.name, loc.city);
    if (!byName[nk]) byName[nk] = [];
    if (byName[nk].indexOf(loc.key) < 0) byName[nk].push(loc.key);
  });

  function lookup(name, town) {
    var hits = exact[placeKey(name, town) + '|' + locationKey(town)];
    if (hits) return hits;
    var only = byName[placeKey(name, town)] || byName[locationKey(name)];
    return only && only.length === 1 ? only : null;
  }

  function pickWard(hits, ward) {
    if (!hits) return null;
    if (hits.length === 1) return hits[0];
    // `ward` comes from the report title the sheet itself parsed; escaped so it is matched literally.
    var safeWard = String(ward).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('Ward\\s*0*' + safeWard + '(?!\\d)', 'i'); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    var w = hits.filter(function (k) { return re.test(String(byKey[k].precincts || '')); });
    return w.length === 1 ? w[0] : hits[0];
  }

  return function match(report) {
    var title = String(report.title || '').trim();
    if (title && aliases[title] && byKey[aliases[title]]) return aliases[title];
    var name = report.name, town = report.city;
    if (!name) {
      var p = parseTitle(title);
      if (!p) return null;
      name = p.name; town = p.town;
    }
    var aliasKey = aliases[name + ' (' + town + ')'];
    if (aliasKey && byKey[aliasKey]) return aliasKey;
    var hits = lookup(name, town);
    if (hits && hits.length === 1) return hits[0];
    var ward = String(name).match(WARD_SUFFIX);
    if (ward) return pickWard(lookup(ward[1], town) || hits, ward[2]);
    return hits ? hits[0] : null;
  };
}

/* ---------- live tab ordering ---------- */

/** Longest line first. A wait value we have not seen sorts just above "No Line". */
var WAIT_RANK = { '3+ hours': 1, '2 hours': 2, '1 hour': 3, '30 minutes': 4, 'no line': 6, 'voting has completed': 7 };
var WAIT_RANK_UNKNOWN = 5, WAIT_RANK_NONE = 8;
var KNOWN_WAITS = ['3+ Hours', '2 Hours', '1 Hour', '30 Minutes', 'No Line', 'Voting has completed'];

function waitRank(w) {
  var k = String(w || '').trim().toLowerCase();
  if (!k) return WAIT_RANK_NONE;
  return WAIT_RANK.hasOwnProperty(k) ? WAIT_RANK[k] : WAIT_RANK_UNKNOWN;
}

/** Sort key for live rows: longest wait, then priority rank (blanks last), then name. */
function compareLive(a, b) {
  var d = waitRank(a.wait) - waitRank(b.wait);
  if (d) return d;
  var ea = a.rank === '' || a.rank == null, eb = b.rank === '' || b.rank == null;
  if (ea !== eb) return ea ? 1 : -1;
  if (!ea && a.rank !== b.rank) return Number(a.rank) - Number(b.rank);
  return String(a.name).localeCompare(String(b.name));
}

/**
 * Reports keyed by location, latest wins. Each report: { key, wait, time, source }.
 * `time` is "h:mm AM/PM" or "HH:mm"; `reportDate` is yyyy-mm-dd.
 */
function latestByKey(reports, reportDate) {
  var out = {};
  reports.forEach(function (r) {
    var c = parseClock(r.time);
    if (!c || !r.key) return;
    var at = reportDate + ' ' + pad2(c.h) + ':' + pad2(c.m);
    if (!out[r.key] || out[r.key].reportedAt < at) {
      out[r.key] = { wait: String(r.wait || '').trim(), source: String(r.source || ''), reportedAt: at, h: c.h, m: c.m };
    }
  });
  return out;
}

if (typeof module !== 'undefined') {
  var M = require('./Metrics.js');
  parseClock = M.parseClock; pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  module.exports = { locationKey: locationKey, placeKey: placeKey, siteKey: siteKey, parseTitle: parseTitle, buildMatcher: buildMatcher, waitRank: waitRank, compareLive: compareLive, latestByKey: latestByKey, KNOWN_WAITS: KNOWN_WAITS };
}
