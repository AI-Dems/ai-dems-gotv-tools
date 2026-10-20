/**
 * Metrics.js — pure counting logic. No Google services, no network.
 *
 * Everything here takes plain arrays/objects and returns plain arrays/objects
 * so it can be unit-tested in Node (see test/).
 *
 * Vocabulary
 *   record  one row of a VAN export as an object keyed by normalized header
 *           (lower-case, trimmed). Dates are strings; see toDay().
 *   hit     one countable thing: {metric, group, date, id}
 *   week    {start, end, label} with 'yyyy-MM-dd' bounds, inclusive
 *   group   a turf or an organizer: {code, name, vanUsers[], eventPrefixes[]}
 *           plus one automatic group, UNASSIGNED, for whatever no group claimed
 */

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Metric types fed by the shifts export. Everything else is fed by the survey export.
var SHIFT_TYPES = ['shifts_completed', 'shifts_scheduled', 'shifts_flaked', 'active_volunteers', 'new_volunteers'];
function isShiftMetric(m) { return SHIFT_TYPES.indexOf(m.type) >= 0; }
function isSurveyMetric(m) { return m.type === 'survey_first_response' || m.type === 'survey_current_response'; }
function isExternalMetric(m) { return m.type === 'external'; }
// Metrics where a smaller number is the good outcome: the dashboard shows "Max" instead of "Goal" and turns red past it.
var LOWER_IS_BETTER = ['shifts_flaked'];
function isLowerBetter(m) { return LOWER_IS_BETTER.indexOf(m.type) >= 0; }

// Signup statuses, normalized. VAN's web variants are included.
var COMPLETED_STATUSES = ['completed'];
var FLAKED_STATUSES = ['no show', 'no-show', 'noshow'];
var OPEN_STATUSES = ['scheduled', 'confirmed', 'sched-web', 'confrm-web', 'invited', 'texted', 'left message'];
// A commitment that came (or will come) due: scheduled in any form, kept, or flaked. Declined and cancelled are not commitments.
var SCHEDULED_STATUSES = ['scheduled', 'confirmed', 'sched-web', 'confrm-web'].concat(COMPLETED_STATUSES, FLAKED_STATUSES);
var DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/* ---------- small helpers ---------- */

function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

/** 'yyyy-MM-dd' -> Date at UTC midnight. */
function parseDay(s) {
  var p = String(s).slice(0, 10).split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
}

/** Date -> 'yyyy-MM-dd' using UTC fields. */
function formatDay(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(dayStr, n) {
  var d = parseDay(dayStr);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDay(d);
}

/**
 * Any date text VAN puts in an export -> 'yyyy-MM-dd', or null if unreadable.
 * Handles '2026-10-07', '2026-10-07 14:03', '10/7/2026', '10/7/2026 2:03:00 PM'.
 * Time of day is ignored; VAN exports are already in the committee's local time.
 */
function toDay(value) {
  var s = String(value == null ? '' : value).trim();
  var y, mo, d;
  var iso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?!\d)/);
  var us = !iso && s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?!\d)/);
  if (iso) { y = +iso[1]; mo = +iso[2]; d = +iso[3]; }
  else if (us) { y = +us[3]; mo = +us[1]; d = +us[2]; if (y < 100) y += 2000; }
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y + '-' + pad2(mo) + '-' + pad2(d);
}

function pad2(n) { return (n < 10 ? '0' : '') + Number(n); }

/* ---------- weeks ---------- */

/** "Oct 5 - 11" or "Oct 26 - Nov 3", matching the original campus sheet. */
function weekLabel(start, end) {
  var s = parseDay(start), e = parseDay(end);
  var left = MONTHS[s.getUTCMonth()] + ' ' + s.getUTCDate();
  var right = (s.getUTCMonth() === e.getUTCMonth() ? '' : MONTHS[e.getUTCMonth()] + ' ') + e.getUTCDate();
  return left + ' - ' + right;
}

/**
 * Weeks from programStart through electionDay. Each week is 7 days starting on
 * weekStartDay, except the last one, which runs through election day.
 * programStart is snapped back to the preceding weekStartDay.
 */
function computeWeeks(programStart, electionDay, weekStartDay) {
  var startDow = DAYS.indexOf(norm(weekStartDay || 'monday'));
  if (startDow < 0) throw new Error('Week start must be a day name, got "' + weekStartDay + '"');
  var first = parseDay(programStart);
  var back = (first.getUTCDay() - startDow + 7) % 7;
  var cursor = addDays(programStart, -back);
  if (cursor > electionDay) throw new Error('Program start must be on or before election day');
  var weeks = [];
  while (true) {
    var next = addDays(cursor, 7);
    // If the following week would be cut short by election day, this week
    // absorbs those days instead (Oct 26 - Nov 3 in the original sheet).
    var isLast = addDays(next, 6) > electionDay;
    var end = isLast ? electionDay : addDays(cursor, 6);
    weeks.push({ start: cursor, end: end, label: weekLabel(cursor, end) });
    if (isLast) return weeks;
    cursor = next;
  }
}

/** The week containing dayStr, or null if outside the program. */
function weekFor(dayStr, weeks) {
  for (var i = 0; i < weeks.length; i++) {
    if (dayStr >= weeks[i].start && dayStr <= weeks[i].end) return weeks[i];
  }
  return null;
}

/* ---------- export headers ---------- */

/**
 * Turn a header row + data rows into records keyed by normalized header.
 * Blank rows are dropped.
 */
function toRecords(header, rows) {
  var keys = header.map(norm);
  var out = [];
  rows.forEach(function (row) {
    if (row.every(function (c) { return c === '' || c == null; })) return;
    var rec = {};
    keys.forEach(function (k, i) { if (k) rec[k] = row[i]; });
    out.push(rec);
  });
  return out;
}

/**
 * Pick the header to use for a field: the configured name if given, else the
 * first candidate present in the header. Returns the normalized name or null.
 */
function resolveColumn(header, configured, candidates) {
  var have = header.map(norm);
  if (configured && norm(configured)) return have.indexOf(norm(configured)) >= 0 ? norm(configured) : null;
  for (var i = 0; i < (candidates || []).length; i++) {
    if (have.indexOf(norm(candidates[i])) >= 0) return norm(candidates[i]);
  }
  return null;
}

/* ---------- grouping ---------- */

/**
 * Words in a person's name or username, lower-case, punctuation removed.
 * "Doe, Jane" and "Jane Doe" both become ["doe", "jane"]; "jdoe" is ["jdoe"].
 */
function nameTokens(s) {
  return norm(s).replace(/[^a-z0-9@._\s-]/g, ' ').split(/[\s,]+/).filter(Boolean).sort();
}

/**
 * Group whose vanUsers list names this person, else null.
 * 1. Same words in any order ("Jane Doe" = "Doe, Jane" = "doe jane").
 * 2. Otherwise, if the cell's words are all part of exactly one listed user's
 *    name (e.g. VAN's CSV split "Doe, Jane" so the cell holds only "Doe"),
 *    that user. If two users share those words, no match: ambiguous.
 */
function groupForPerson(person, groups) {
  var want = nameTokens(person);
  if (!want.length) return null;
  var key = want.join(' ');
  var partial = [];
  for (var i = 0; i < groups.length; i++) {
    var users = groups[i].vanUsers || [];
    for (var j = 0; j < users.length; j++) {
      var have = nameTokens(users[j]);
      if (have.join(' ') === key) return groups[i].code;
      if (want.every(function (w) { return have.indexOf(w) >= 0; })) partial.push(groups[i].code);
    }
  }
  var distinct = partial.filter(function (c, i) { return partial.indexOf(c) === i; });
  return distinct.length === 1 ? distinct[0] : null;
}

/** Kept for callers that only have a canvasser: same as groupForPerson. */
function groupForCanvasser(canvasser, groups) {
  return groupForPerson(canvasser, groups);
}

/** Group whose eventPrefixes (other than the catch-all "*") match the start of this event name, else null. */
function groupForEvent(eventName, groups) {
  var n = norm(eventName);
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].eventPrefixes.some(function (p) { return p && p !== '*' && n.indexOf(norm(p)) === 0; })) return groups[i].code;
  }
  return null;
}

/** The first group whose eventPrefixes include "*", else null. It claims every shift nothing else did. */
function catchAllGroup(groups) {
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].eventPrefixes.indexOf('*') >= 0) return groups[i].code;
  }
  return null;
}

/** True if the event name starts with one of the ignore prefixes (default "[Cancelled]"). */
function isIgnoredEvent(eventName, ignorePrefixes) {
  var n = norm(eventName);
  return (ignorePrefixes || []).some(function (p) { return p && n.indexOf(norm(p)) === 0; });
}

/**
 * Who gets a shift. Returns {code, how}; code is null when nobody claimed it.
 *   credit          the credit column (e.g. Recruited By) names a listed user
 *   organizer       the volunteer's own organizer column (e.g. DCCC Organizer) names a listed user
 *   prefix          the event name starts with a group's prefix
 *   catchall        a group lists "*" as a prefix
 *   unlisted_credit the credit column has a name, but it is not in any group
 *   no_credit       the credit column is blank, and no prefix matched
 *   no_prefix       there is no credit column, and no prefix matched
 */
function groupForShift(eventName, credit, hasCreditColumn, groups, organizer) {
  if (hasCreditColumn && norm(credit)) {
    var byPerson = groupForPerson(credit, groups);
    if (byPerson) return { code: byPerson, how: 'credit' };
  }
  if (norm(organizer)) {
    var byOrganizer = groupForPerson(organizer, groups);
    if (byOrganizer) return { code: byOrganizer, how: 'organizer' };
  }
  var byEvent = groupForEvent(eventName, groups);
  if (byEvent) return { code: byEvent, how: 'prefix' };
  var all = catchAllGroup(groups);
  if (all) return { code: all, how: 'catchall' };
  if (!hasCreditColumn) return { code: null, how: 'no_prefix' };
  return { code: null, how: norm(credit) ? 'unlisted_credit' : 'no_credit' };
}

/* ---------- hits ---------- */

/**
 * Survey-based hits from the survey export.
 * records:   from toRecords(); one row per person (or per response, both work)
 * metrics:   [{key, type, valueColumn, dateColumn, canvasserColumn, responseName}]
 * vanIdCol:  normalized header of the VanID column (dedupes people)
 * unassignedCode: group code for responses by users in no group (null drops them, the old behaviour)
 * Returns {hits, unassigned, badDates}.
 */
function surveyHits(records, metrics, groups, vanIdCol, unassignedCode) {
  var hits = [], unassigned = 0, badDates = 0;
  metrics.forEach(function (m) {
    if (m.type !== 'survey_first_response' && m.type !== 'survey_current_response') return;
    var firstByPerson = {};
    records.forEach(function (r, i) {
      var value = r[norm(m.valueColumn)];
      if (value === '' || value == null) return;                       // no response
      if (m.type === 'survey_current_response' && !responseMatches(value, m)) return;
      var date = toDay(r[norm(m.dateColumn)]);
      if (!date) { badDates++; return; }
      var group = groupForPerson(r[norm(m.canvasserColumn)], groups) || catchAllGroup(groups);   // the "*" group takes unlisted canvassers too
      if (!group) { unassigned++; if (!unassignedCode) return; group = unassignedCode; }
      var id = String(r[vanIdCol] || ('row' + i));
      var prev = firstByPerson[id];
      if (!prev || date < prev.date) firstByPerson[id] = { metric: m.key, group: group, date: date, id: id };
    });
    Object.keys(firstByPerson).forEach(function (k) { hits.push(firstByPerson[k]); });
  });
  return { hits: hits, unassigned: unassigned, badDates: badDates };
}

/**
 * The answers a survey_current_response metric counts, from its response_name:
 * several answers separated by semicolons, or by commas when no semicolon is
 * present ("Yes, Maybe"; "1 - Strong Dem; 2 - Lean Dem"). "*" means any answer.
 */
function responseList(responseName) {
  var s = String(responseName == null ? '' : responseName).trim();
  if (!s) return [];
  var sep = s.indexOf(';') >= 0 ? ';' : ',';
  return s.split(sep).map(function (x) { return norm(x); }).filter(Boolean);
}

/** True if this (non-blank) answer is one the metric counts. */
function responseMatches(value, m) {
  var want = responseList(m.responseName);
  if (want.indexOf('*') >= 0) return true;
  var whole = norm(m.responseName);
  return want.indexOf(norm(value)) >= 0 || (whole !== '' && norm(value) === whole);   // an answer that itself contains a comma
}

/** True for "Yes", "True", "1", "Y" (VAN's Is Most Recent Response column). */
function isTruthy(v) {
  var s = norm(v);
  return s === 'yes' || s === 'true' || s === '1' || s === 'y';
}

/**
 * Survey-based hits from VAN's Survey Response Report ("long" format): one row
 * per response, with the question's name in a column. Each metric's
 * valueColumn is the question name to keep (compared trimmed, ignoring case).
 * cols: normalized headers {question, response, date, canvasser, vanId, flag?, id?}
 *   survey_first_response    a person counts once, in the week of their earliest
 *                            response to the question in the imported rows
 *   survey_current_response  a person counts if their latest response to the
 *                            question (by date; VAN's most-recent flag breaks
 *                            ties) equals responseName, in the week of that response
 * Same-day ties for the current response: the higher Survey Response ID wins (VAN assigns
 * them in order), else the row flagged most recent, else the later row.
 * Returns {hits, unassigned, badDates, questions: {name: rowCount}, answers: {metricKey: {answer: count}}}.
 */
function surveyHitsLong(records, metrics, groups, cols, unassignedCode) {
  var hits = [], unassigned = 0, badDates = 0, questions = {}, answers = {};
  records.forEach(function (r) { var q = String(r[cols.question] == null ? '' : r[cols.question]).trim(); if (q) questions[q] = (questions[q] || 0) + 1; });
  metrics.forEach(function (m) {
    if (m.type !== 'survey_first_response' && m.type !== 'survey_current_response') return;
    var want = norm(m.valueColumn);
    var byPerson = {}, seen = answers[m.key] = {};
    records.forEach(function (r, i) {
      if (norm(r[cols.question]) !== want) return;
      var value = r[cols.response];
      if (value === '' || value == null) return;
      var shown = String(value).trim(); seen[shown] = (seen[shown] || 0) + 1;
      var date = toDay(r[cols.date]);
      if (!date) { badDates++; return; }
      var id = String(r[cols.vanId] || ('row' + i));
      var flag = cols.flag ? isTruthy(r[cols.flag]) : false;
      var rid = cols.id ? Number(r[cols.id]) : NaN;
      var prev = byPerson[id];
      var take;
      if (m.type === 'survey_first_response') take = !prev || date < prev.date;
      else take = !prev || date > prev.date || (date === prev.date && laterResponse_(rid, flag, prev));
      if (take) byPerson[id] = { date: date, value: value, canvasser: r[cols.canvasser], flag: flag, rid: rid, id: id };
    });
    Object.keys(byPerson).forEach(function (k) {
      var p = byPerson[k];
      if (m.type === 'survey_current_response' && !responseMatches(p.value, m)) return;
      var group = groupForPerson(p.canvasser, groups) || catchAllGroup(groups);   // the "*" group takes unlisted canvassers too
      if (!group) { unassigned++; if (!unassignedCode) return; group = unassignedCode; }
      hits.push({ metric: m.key, group: group, date: p.date, id: p.id });
    });
  });
  return { hits: hits, unassigned: unassigned, badDates: badDates, questions: questions, answers: answers };
}

/** Tie-break between two same-day responses: higher response id, else the most-recent flag, else the later row. */
function laterResponse_(rid, flag, prev) {
  if (!isNaN(rid) && !isNaN(prev.rid) && rid !== prev.rid) return rid > prev.rid;
  if (flag !== prev.flag) return flag;
  return true;
}

/** True if this signup row passes the metric's event-type filter (blank filter = everything). */
function matchesEventType(r, m, cols) {
  var want = (m.eventTypes || []).map(norm).filter(Boolean);
  if (!want.length) return true;
  if (!cols.eventType) return false;                                  // filter set but the export has no event-type column
  return want.indexOf(norm(r[cols.eventType])) >= 0;
}

/**
 * Hits from the shifts export, for every shift-based metric type:
 *   shifts_completed   status Completed, in the week of the event. One per person + event + date + shift.
 *   shifts_scheduled   any commitment (Scheduled, Confirmed, web variants, Completed, No Show), by event date.
 *   shifts_flaked      status No Show, by event date.
 *   active_volunteers  distinct people with a Completed shift that week.
 *   new_volunteers     people whose first Completed shift in the export falls that week.
 * Each metric may filter by event type (m.eventTypes, matched against cols.eventType).
 * cols: normalized headers {eventName, eventDate, status, vanId, shift?, credit?, eventType?}
 * opts: {unassignedCode, ignorePrefixes, today}
 * Returns {hits, completed, by: {credit, prefix, catchall, unlisted_credit, no_credit, no_prefix},
 *          unassigned, ignored, unmarkedPast, badDates}. Tallies describe completed shifts.
 */
function shiftHits(records, metrics, groups, cols, opts) {
  opts = opts || {};
  var shiftMetrics = metrics.filter(isShiftMetric);
  var out = { hits: [], completed: 0, by: { credit: 0, organizer: 0, prefix: 0, catchall: 0, unlisted_credit: 0, no_credit: 0, no_prefix: 0 }, unassigned: 0, ignored: 0, unmarkedPast: 0, badDates: 0, noVanId: 0 };
  if (!shiftMetrics.length) return out;
  var hasCredit = !!cols.credit;
  var firstCompleted = {};                                            // vanId -> {date, group, r} for new_volunteers
  records.forEach(function (r, idx) {
    var eventName = r[cols.eventName];
    var status = norm(r[cols.status]);
    var completed = COMPLETED_STATUSES.indexOf(status) >= 0;
    if (isIgnoredEvent(eventName, opts.ignorePrefixes)) { if (completed) out.ignored++; return; }
    var date = toDay(r[cols.eventDate]);
    if (!date) { out.badDates++; return; }
    if (!completed && opts.today && date < opts.today && OPEN_STATUSES.indexOf(status) >= 0) out.unmarkedPast++;

    var who = groupForShift(eventName, hasCredit ? r[cols.credit] : '', hasCredit, groups, cols.organizer ? r[cols.organizer] : '');
    if (completed) { out.completed++; out.by[who.how]++; if (!who.code) out.unassigned++; }
    var code = who.code;
    if (!code) { if (!opts.unassignedCode) return; code = opts.unassignedCode; }

    var person = String(r[cols.vanId] == null ? '' : r[cols.vanId]).trim();
    if (!person) out.noVanId++;
    var shiftId = [person || ('row' + idx), norm(eventName), date, cols.shift ? norm(r[cols.shift]) : ''].join('|');   // a blank VANID never merges rows
    shiftMetrics.forEach(function (m) {
      if (!matchesEventType(r, m, cols)) return;
      if (m.type === 'shifts_completed' && completed) out.hits.push({ metric: m.key, group: code, date: date, id: shiftId });
      if (m.type === 'shifts_scheduled' && SCHEDULED_STATUSES.indexOf(status) >= 0) out.hits.push({ metric: m.key, group: code, date: date, id: shiftId });
      if (m.type === 'shifts_flaked' && FLAKED_STATUSES.indexOf(status) >= 0) out.hits.push({ metric: m.key, group: code, date: date, id: shiftId });
      if (m.type === 'active_volunteers' && completed && person) out.hits.push({ metric: m.key, group: code, date: date, id: person });
      if (m.type === 'new_volunteers' && completed && person) {
        var prev = firstCompleted[m.key + '|' + person];
        if (!prev || date < prev.date) firstCompleted[m.key + '|' + person] = { metric: m.key, group: code, date: date, id: person };
      }
    });
  });
  Object.keys(firstCompleted).forEach(function (k) { out.hits.push(firstCompleted[k]); });
  return out;
}

/**
 * Count distinct hit ids per (week, group, metric). Returns a dense grid: every
 * combination of week (through `today`), group and metric gets a row, even if 0.
 * Output rows match the raw-tab contract in docs/data-contract.md.
 */
function countHits(hits, weeks, groups, metrics, today) {
  var seen = {};
  hits.forEach(function (h) {
    var w = weekFor(h.date, weeks);
    if (!w) return;
    var key = w.label + '|' + h.group + '|' + h.metric;
    (seen[key] = seen[key] || {})[h.id] = true;
  });
  var rows = [];
  weeks.forEach(function (w) {
    if (w.start > today) return;
    metrics.forEach(function (m) {
      groups.forEach(function (g) {
        var key = w.label + '|' + g.code + '|' + m.key;
        rows.push({ key: key, metric: m.key, label: m.label, group: g.code, weekStart: w.start, weekLabel: w.label, value: Object.keys(seen[key] || {}).length });
      });
    });
  });
  return rows;
}

// Node export for tests; ignored by Apps Script.
if (typeof module !== 'undefined') {
  module.exports = { laterResponse_: laterResponse_, isLowerBetter: isLowerBetter, isSurveyMetric: isSurveyMetric, isExternalMetric: isExternalMetric, SHIFT_TYPES: SHIFT_TYPES, isShiftMetric: isShiftMetric, matchesEventType: matchesEventType, isTruthy: isTruthy, responseList: responseList, responseMatches: responseMatches, surveyHitsLong: surveyHitsLong, norm: norm, parseDay: parseDay, formatDay: formatDay, addDays: addDays, toDay: toDay, weekLabel: weekLabel, computeWeeks: computeWeeks, weekFor: weekFor, toRecords: toRecords, resolveColumn: resolveColumn, nameTokens: nameTokens, groupForPerson: groupForPerson, groupForCanvasser: groupForCanvasser, groupForEvent: groupForEvent, catchAllGroup: catchAllGroup, isIgnoredEvent: isIgnoredEvent, groupForShift: groupForShift, surveyHits: surveyHits, shiftHits: shiftHits, countHits: countHits };
}
