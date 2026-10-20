/**
 * Metrics.js — the priority math. Pure functions on plain arrays, so they run
 * in Node for tests (npm test) and inside the Sheet unchanged.
 *
 * For each location:
 *   likely_voters      Σ t        expected ballots
 *   likely_supporters  Σ p·t      expected votes for us
 *   net vote gain      2·S − V    our votes minus everyone else's
 *
 * A voter adds p·t votes for us and (1−p)·t for others, so each voter's net is
 * (2p−1)·t. Positive net vote gain means a shorter line there helps us on net.
 */

var TIERS = 5;

function netVoteGain(likelySupporters, likelyVoters) {
  return 2 * Number(likelySupporters || 0) - Number(likelyVoters || 0);
}

/** Competition rank ("1224"), highest value first. Returns ranks aligned with `values`. */
function rankDesc(values) {
  var sorted = values.map(function (v, i) { return { v: Number(v), i: i }; })
    .sort(function (a, b) { return b.v - a.v; });
  var ranks = new Array(values.length), rank = 0;
  sorted.forEach(function (s, pos) {
    if (pos === 0 || s.v !== sorted[pos - 1].v) rank = pos + 1;
    ranks[s.i] = rank;
  });
  return ranks;
}

/**
 * Jenks natural breaks: k−1 upper bounds (ascending) that split `data` into k
 * classes with the least within-class variance. O(n²·k), fine for a few
 * thousand locations.
 */
function jenksBreaks(data, k) {
  var d = data.map(Number).filter(function (x) { return !isNaN(x); }).sort(function (a, b) { return a - b; });
  var n = d.length;
  if (n === 0) return [];
  if (n <= k) {
    var distinct = d.filter(function (x, i) { return i === 0 || x !== d[i - 1]; });
    while (distinct.length < k - 1) distinct.push(distinct[distinct.length - 1]);
    return distinct.slice(0, k - 1);
  }
  var lower = [], variance = [];
  for (var i = 0; i <= n; i++) {
    lower.push([]); variance.push([]);
    for (var j = 0; j <= k; j++) { lower[i].push(0); variance[i].push(0); }
  }
  for (var j1 = 1; j1 <= k; j1++) {
    lower[1][j1] = 1; variance[1][j1] = 0;
    for (var i1 = 2; i1 <= n; i1++) variance[i1][j1] = Infinity;
  }
  for (var l = 2; l <= n; l++) {
    var sum = 0, sumSq = 0, w = 0, v = 0;
    for (var m = 1; m <= l; m++) {
      var lo = l - m + 1, val = d[lo - 1];
      w++; sum += val; sumSq += val * val;
      v = sumSq - (sum * sum) / w;
      if (lo !== 1) {
        for (var j2 = 2; j2 <= k; j2++) {
          if (variance[l][j2] >= v + variance[lo - 1][j2 - 1]) {
            lower[l][j2] = lo;
            variance[l][j2] = v + variance[lo - 1][j2 - 1];
          }
        }
      }
    }
    lower[l][1] = 1; variance[l][1] = v;
  }
  var breaks = [], end = n;
  for (var j3 = k; j3 >= 2; j3--) {
    breaks.unshift(d[lower[end][j3] - 2]);
    end = lower[end][j3] - 1;
  }
  return breaks;
}

/** Round to 2 significant figures, so an auto cutoff reads like a number a person chose (1,234.5 → 1,200). */
function roundSig(x) {
  if (!x) return 0;
  var p = Math.pow(10, Math.floor(Math.log(Math.abs(x)) / Math.LN10) - 1);
  return Math.round(x / p) * p;
}

/**
 * Tier cutoffs for one measure: four numbers, descending. Tier 1 is above the
 * first, tier 5 at or below the last. `manual` (from Setup) wins when given;
 * otherwise natural breaks in the data, rounded.
 */
function tierCutoffs(values, manual) {
  if (manual && manual.length) return manual;
  return jenksBreaks(values, TIERS).map(roundSig).reverse();
}

/** 1–5 for `value` against descending `cutoffs`. Each range includes its upper bound. */
function tierOf(value, cutoffs) {
  var v = Number(value);
  for (var i = 0; i < cutoffs.length; i++) if (v > cutoffs[i]) return i + 1;
  return cutoffs.length + 1;
}

/** "1000, 400, 0, -400" → [1000, 400, 0, -400]; blank → null (auto). Anything else throws. */
function parseCutoffs(text) {
  var s = String(text || '').trim();
  if (!s || /^auto$/i.test(s)) return null;
  var nums = s.split(/[,\s;]+/).filter(Boolean).map(Number);
  if (nums.length !== TIERS - 1 || nums.some(isNaN)) {
    throw new Error('Tier cutoffs must be ' + (TIERS - 1) + ' numbers from high to low, e.g. "1000, 400, 0, -400", or blank for automatic. Got "' + s + '"');
  }
  for (var i = 1; i < nums.length; i++) {
    if (nums[i] > nums[i - 1]) throw new Error('Tier cutoffs must go from high to low. Got "' + s + '"');
  }
  return nums;
}

/**
 * The whole calculation. `locations` are rows from the locations tab;
 * `manual` is { nvg, supporters, voters } of cutoff arrays or null.
 * Returns rows in rank order plus the cutoffs actually used.
 */
function computePriority(locations, manual) {
  manual = manual || {};
  var rows = locations.map(function (loc) {
    return {
      key: loc.key, name: loc.name, city: loc.city, county: loc.county, address: loc.address,
      precincts: loc.precincts, registered: loc.registered, extras: loc.extras,
      likelyVoters: Number(loc.likelyVoters) || 0,
      likelySupporters: Number(loc.likelySupporters) || 0,
      nvg: netVoteGain(loc.likelySupporters, loc.likelyVoters)
    };
  });
  var pick = function (k) { return rows.map(function (r) { return r[k]; }); };
  var cutoffs = {
    nvg: tierCutoffs(pick('nvg'), manual.nvg),
    supporters: tierCutoffs(pick('likelySupporters'), manual.supporters),
    voters: tierCutoffs(pick('likelyVoters'), manual.voters)
  };
  var nvgRank = rankDesc(pick('nvg')), votersRank = rankDesc(pick('likelyVoters'));
  rows.forEach(function (r, i) {
    r.rank = nvgRank[i];
    r.votersRank = votersRank[i];
    r.tier = tierOf(r.nvg, cutoffs.nvg);
    r.supportersTier = tierOf(r.likelySupporters, cutoffs.supporters);
    r.votersTier = tierOf(r.likelyVoters, cutoffs.voters);
  });
  rows.sort(function (a, b) { return a.rank - b.rank || a.name.localeCompare(b.name); });
  return { rows: rows, cutoffs: cutoffs, auto: { nvg: !manual.nvg, supporters: !manual.supporters, voters: !manual.voters } };
}

/* ---------- small parsers shared by Setup and the line tracker ---------- */

var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "2026-11-03", "11/3/2026", "Nov 3, 2026", "November 3 2026", "3 Nov 2026" → "2026-11-03"; anything else → "". */
function parseDay(s) {
  var t = String(s || '').trim();
  var iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return iso[1] + '-' + pad2(+iso[2]) + '-' + pad2(+iso[3]);
  var us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return us[3] + '-' + pad2(+us[1]) + '-' + pad2(+us[2]);
  var mdy = t.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/) || t.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);
  if (!mdy) return '';
  var name = isNaN(mdy[1]) ? mdy[1] : mdy[2], day = isNaN(mdy[1]) ? mdy[2] : mdy[1];
  var month = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  if (month < 0 || +day < 1 || +day > 31) return '';
  return mdy[3] + '-' + pad2(month + 1) + '-' + pad2(+day);
}

/** "4:15 PM", "4:15pm", "16:15" → { h: 16, m: 15 }, else null. */
function parseClock(s) {
  var m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (!m) return null;
  var h = Number(m[1]), min = Number(m[2]);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = h % 12 + (/p/i.test(m[3]) ? 12 : 0);
  }
  return h < 24 && min < 60 ? { h: h, m: min } : null;
}

/** "4:15 PM, 5:15 PM" → [{h, m, text, label}], unreadable entries dropped. */
function parseTimes(text) {
  return String(text || '').split(/[,;\n]+/).map(function (t) { return t.trim(); }).filter(Boolean)
    .map(function (t) {
      var c = parseClock(t);
      return c && { h: c.h, m: c.m, text: t, label: ((c.h + 11) % 12 + 1) + ':' + pad2(c.m) };
    }).filter(Boolean);
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

if (typeof module !== 'undefined') {
  module.exports = { netVoteGain: netVoteGain, rankDesc: rankDesc, jenksBreaks: jenksBreaks, roundSig: roundSig, tierCutoffs: tierCutoffs, tierOf: tierOf, parseCutoffs: parseCutoffs, computePriority: computePriority, parseDay: parseDay, parseClock: parseClock, parseTimes: parseTimes };
}
