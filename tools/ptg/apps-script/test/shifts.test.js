// Run with `npm test`. Shift crediting, the Unassigned row, cancelled events and unmarked shifts.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../Metrics.js');

const groups = [
  { code: 'JANE', name: 'Jane', vanUsers: ['Jane Doe'], eventPrefixes: ['Saginaw_'] },
  { code: 'PAT', name: 'Pat', vanUsers: ['pat.smith', 'Pat Smith'], eventPrefixes: ['Daily_Canvass_Midland'] },
  { code: 'ALL', name: 'Everything else', vanUsers: [], eventPrefixes: ['*'] },
];
const noCatchAll = groups.slice(0, 2);
const cols = { eventName: 'event name', eventDate: 'event date', status: 'status', vanId: 'vanid', shift: 'shift start time', credit: 'recruited by' };
const opts = { unassignedCode: 'UNASSIGNED', ignorePrefixes: ['[Cancelled]'], today: '2026-10-20' };
const row = (o) => Object.assign({ vanid: '1', 'event name': 'Saginaw_Canvass', 'event date': '2026-10-07', status: 'Completed', 'shift start time': '10:00', 'recruited by': '' }, o);
const metrics = [{ key: 'shifts', label: 'Shifts', type: 'shifts_completed' }];

test('groupForPerson: same words in any order, "Last, First", usernames, case', () => {
  assert.equal(M.groupForPerson('Jane Doe', groups), 'JANE');
  assert.equal(M.groupForPerson('Doe, Jane', groups), 'JANE');
  assert.equal(M.groupForPerson('  doe, jane ', groups), 'JANE');
  assert.equal(M.groupForPerson('PAT.SMITH', groups), 'PAT');
  assert.equal(M.groupForPerson('', groups), null);
  assert.equal(M.groupForPerson('Nobody Here', groups), null);
});

test('groupForPerson: a cell holding only part of a name (VAN split "Last, First" across two cells) matches when unique', () => {
  assert.equal(M.groupForPerson('Doe', groups), 'JANE');
  assert.equal(M.groupForPerson('Smith', groups), 'PAT');
  const twoDoes = groups.concat([{ code: 'SAM', name: 'Sam', vanUsers: ['Sam Doe'], eventPrefixes: [] }]);
  assert.equal(M.groupForPerson('Doe', twoDoes), null, 'ambiguous last name does not guess');
  assert.equal(M.groupForPerson('Sam Doe', twoDoes), 'SAM');
});

test('groupForShift: credit column first, then prefix, then catch-all, else unassigned with a reason', () => {
  assert.deepEqual(M.groupForShift('Daily_Canvass_Midland', 'Jane Doe', true, groups), { code: 'JANE', how: 'credit' });
  assert.deepEqual(M.groupForShift('Daily_Canvass_Midland', '', true, groups), { code: 'PAT', how: 'prefix' });
  assert.deepEqual(M.groupForShift('Random Event', '', true, groups), { code: 'ALL', how: 'catchall' });
  assert.deepEqual(M.groupForShift('Random Event', '', true, noCatchAll), { code: null, how: 'no_credit' });
  assert.deepEqual(M.groupForShift('Random Event', 'Someone Else', true, noCatchAll), { code: null, how: 'unlisted_credit' });
  assert.deepEqual(M.groupForShift('Random Event', '', false, noCatchAll), { code: null, how: 'no_prefix' });
});

test('groupForEvent ignores the "*" prefix; catchAllGroup finds it', () => {
  assert.equal(M.groupForEvent('Anything', groups), null);
  assert.equal(M.catchAllGroup(groups), 'ALL');
  assert.equal(M.catchAllGroup(noCatchAll), null);
});

test('isIgnoredEvent: default [Cancelled] prefix, case-insensitive, leading spaces', () => {
  assert.equal(M.isIgnoredEvent('[Cancelled] Bay_Canvass', ['[Cancelled]']), true);
  assert.equal(M.isIgnoredEvent('  [cancelled] x', ['[Cancelled]']), true);
  assert.equal(M.isIgnoredEvent('Bay_Canvass', ['[Cancelled]']), false);
  assert.equal(M.isIgnoredEvent('[Cancelled] x', []), false);
});

test('shiftHits: unassigned shifts become hits on the Unassigned row, with reasons tallied', () => {
  const records = [
    row({ vanid: '1', 'recruited by': 'Doe' }),                                   // split cell → JANE by credit
    row({ vanid: '2', 'event name': 'Daily_Canvass_Midland' }),                       // prefix → PAT
    row({ vanid: '3', 'event name': 'Random', 'recruited by': 'Someone Else' }),      // unlisted credit → unassigned
    row({ vanid: '4', 'event name': 'Random' }),                                      // no credit → unassigned
  ];
  const e = M.shiftHits(records, metrics, noCatchAll, cols, opts);
  assert.equal(e.hits.length, 4);
  assert.deepEqual(e.hits.map((h) => h.group), ['JANE', 'PAT', 'UNASSIGNED', 'UNASSIGNED']);
  assert.equal(e.unassigned, 2);
  assert.deepEqual(e.by, { credit: 1, organizer: 0, prefix: 1, catchall: 0, unlisted_credit: 1, no_credit: 1, no_prefix: 0 });
});

test('shiftHits: with a catch-all group nothing is unassigned', () => {
  const e = M.shiftHits([row({ 'event name': 'Random' })], metrics, groups, cols, opts);
  assert.deepEqual(e.hits.map((h) => h.group), ['ALL']);
  assert.equal(e.unassigned, 0);
});

test('shiftHits: cancelled events are skipped and counted; non-completed rows never count', () => {
  const records = [
    row({ 'event name': '[Cancelled] Saginaw_Canvass' }),
    row({ vanid: '9', status: 'No Show' }),
    row({ vanid: '8', status: 'Declined' }),
  ];
  const e = M.shiftHits(records, metrics, groups, cols, opts);
  assert.equal(e.hits.length, 0);
  assert.equal(e.ignored, 1);
  assert.equal(e.unmarkedPast, 0);
});

test('shiftHits: past shifts left Scheduled/Confirmed are reported as unmarked, future ones are not', () => {
  const records = [
    row({ vanid: '1', status: 'Scheduled', 'event date': '2026-10-10' }),
    row({ vanid: '2', status: 'Confrm-Web', 'event date': '2026-10-12' }),
    row({ vanid: '3', status: 'Scheduled', 'event date': '2026-10-25' }),
    row({ vanid: '4', status: 'No Show', 'event date': '2026-10-10' }),
  ];
  const e = M.shiftHits(records, metrics, groups, cols, opts);
  assert.equal(e.unmarkedPast, 2);
});

test('shiftHits: duplicate VAN rows for one shift count once; two shifts same day count twice', () => {
  const records = [row({ vanid: '1' }), row({ vanid: '1' }), row({ vanid: '1', 'shift start time': '14:00' })];
  const e = M.shiftHits(records, metrics, groups, cols, opts);
  const weeks = M.computeWeeks('2026-10-05', '2026-11-03', 'Monday');
  const rows = M.countHits(e.hits, weeks, groups.concat([{ code: 'UNASSIGNED' }]), metrics, '2026-10-20');
  const jane = rows.find((r) => r.group === 'JANE' && r.weekLabel === 'Oct 5 - 11');
  assert.equal(jane.value, 2);
});

test('shiftHits without a credit column falls back to prefixes, reason no_prefix', () => {
  const noCredit = Object.assign({}, cols, { credit: null });
  const e = M.shiftHits([row({ 'event name': 'Random', 'recruited by': 'Jane Doe' })], metrics, noCatchAll, noCredit, opts);
  assert.deepEqual(e.hits.map((h) => h.group), ['UNASSIGNED']);
  assert.equal(e.by.no_prefix, 1);
});

test('shiftHits: old behaviour (drop unassigned) when no unassignedCode is given', () => {
  const e = M.shiftHits([row({ 'event name': 'Random' })], metrics, noCatchAll, cols, { ignorePrefixes: [] });
  assert.equal(e.hits.length, 0);
  assert.equal(e.unassigned, 1);
});

test('surveyHits: responses by unlisted users go to the Unassigned row', () => {
  const sm = [{ key: 'signups', label: 'Signups', type: 'survey_first_response', valueColumn: 'Q', dateColumn: 'Q Date', canvasserColumn: 'Q Canvasser' }];
  const recs = [
    { vanid: '1', q: 'Yes', 'q date': '2026-10-07', 'q canvasser': 'Jane Doe' },
    { vanid: '2', q: 'Yes', 'q date': '2026-10-07', 'q canvasser': 'Unknown Person' },
  ];
  const s = M.surveyHits(recs, sm, noCatchAll, 'vanid', 'UNASSIGNED');
  assert.deepEqual(s.hits.map((h) => h.group).sort(), ['JANE', 'UNASSIGNED']);
  assert.equal(s.unassigned, 1);
  assert.equal(M.surveyHits(recs, sm, noCatchAll, 'vanid').hits.length, 1, 'without a code, unlisted responses are dropped as before');
  assert.deepEqual(M.surveyHits(recs, sm, groups, 'vanid', 'UNASSIGNED').hits.map((h) => h.group).sort(), ['ALL', 'JANE'], 'with a * group, it takes the unlisted canvasser');
});

test('countHits: the Unassigned group gets a row per week and metric like any group', () => {
  const weeks = M.computeWeeks('2026-10-05', '2026-11-03', 'Monday');
  const rows = M.countHits([], weeks, [{ code: 'JANE' }, { code: 'UNASSIGNED' }], metrics, '2026-10-20');
  assert.equal(rows.filter((r) => r.group === 'UNASSIGNED').length, 3);
});
