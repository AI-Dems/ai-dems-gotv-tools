// Run with `npm test`. Fallback credit through the volunteer's own organizer column.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../Metrics.js');

const groups = [{ code: 'JANE', name: 'Jane', vanUsers: ['Jane Doe'], eventPrefixes: [] }, { code: 'PAT', name: 'Pat', vanUsers: ['Pat Smith'], eventPrefixes: [] }];
const cols = { eventName: 'event name', eventDate: 'event date', status: 'status', vanId: 'vanid', shift: null, credit: 'recruited by', eventType: null, organizer: 'dccc organizer' };
const opts = { unassignedCode: 'UNASSIGNED', ignorePrefixes: [], today: '2026-10-20' };
const row = (o) => Object.assign({ vanid: '1', 'event name': 'X', 'event date': '2026-10-07', status: 'Completed', 'recruited by': '', 'dccc organizer': '' }, o);
const m = [{ key: 'done', type: 'shifts_completed', eventTypes: [] }];

test('Recruited By wins; a blank Recruited By falls back to the DCCC Organizer; both blank is unassigned', () => {
  assert.deepEqual(M.groupForShift('X', 'Jane Doe', true, groups, 'Pat Smith'), { code: 'JANE', how: 'credit' });
  assert.deepEqual(M.groupForShift('X', '', true, groups, 'Smith, Pat'), { code: 'PAT', how: 'organizer' });
  assert.deepEqual(M.groupForShift('X', 'Nobody Listed', true, groups, 'Pat Smith'), { code: 'PAT', how: 'organizer' }, 'an unlisted recruiter also falls through to the organizer');
  assert.deepEqual(M.groupForShift('X', '', true, groups, ''), { code: null, how: 'no_credit' });
  assert.deepEqual(M.groupForShift('X', '', true, groups, undefined), { code: null, how: 'no_credit' });
});

test('shiftHits tallies organizer credit separately', () => {
  const e = M.shiftHits([row({ 'recruited by': 'Jane Doe' }), row({ vanid: '2', 'dccc organizer': 'Pat Smith' }), row({ vanid: '3' })], m, groups, cols, opts);
  assert.equal(e.by.credit, 1); assert.equal(e.by.organizer, 1); assert.equal(e.by.no_credit, 1);
  assert.deepEqual(e.hits.map((h) => h.group), ['JANE', 'PAT', 'UNASSIGNED']);
});

test('without an organizer column nothing changes', () => {
  const noOrg = Object.assign({}, cols, { organizer: null });
  const e = M.shiftHits([row({ vanid: '2', 'dccc organizer': 'Pat Smith' })], m, groups, noOrg, opts);
  assert.deepEqual(e.hits.map((h) => h.group), ['UNASSIGNED']);
});
