// Run with `npm test`. Fixes from the 2026-10-20 adversarial review.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../Metrics.js');
const { splitPeople_ } = require('../Config.js');

test('toDay: two-digit years, slashes in ISO order, impossible dates rejected', () => {
  assert.equal(M.toDay('10/7/26'), '2026-10-07');
  assert.equal(M.toDay('2026/10/07'), '2026-10-07');
  assert.equal(M.toDay('2026-10-07 10:00:00.0000000 -04:00'), '2026-10-07');
  assert.equal(M.toDay('13/40/2026'), null);
  assert.equal(M.toDay('2026-13-01'), null);
  assert.equal(M.toDay('Oct 7, 2026'), null);
});

test('responseMatches: a single answer that contains a comma matches as a whole', () => {
  assert.equal(M.responseMatches('Yes, definitely', { responseName: 'Yes, definitely' }), true);
  assert.equal(M.responseMatches('Yes', { responseName: 'Yes, definitely' }), true, 'the comma split still works as a list');
  assert.equal(M.responseMatches('No', { responseName: 'Yes, definitely' }), false);
});

test('laterResponse_: higher response id wins a same-day tie; else the flag; else the later row', () => {
  assert.equal(M.laterResponse_(101, false, { rid: 100, flag: true }), true);
  assert.equal(M.laterResponse_(99, true, { rid: 100, flag: false }), false);
  assert.equal(M.laterResponse_(NaN, true, { rid: NaN, flag: false }), true);
  assert.equal(M.laterResponse_(NaN, false, { rid: NaN, flag: true }), false);
  assert.equal(M.laterResponse_(NaN, false, { rid: NaN, flag: false }), true);
});

test('survey_current_response: same-day Yes then No with ids, in either row order, is No', () => {
  const groups = [{ code: 'JANE', name: 'Jane', vanUsers: ['Jane Doe'], eventPrefixes: [] }];
  const cols = { question: 'q', response: 'a', date: 'd', canvasser: 'c', vanId: 'v', flag: 'f', id: 'id' };
  const yes = { key: 'yes', type: 'survey_current_response', valueColumn: 'Q', responseName: 'Yes' };
  const a = { v: '1', q: 'Q', a: 'Yes', d: '2026-10-07', c: 'Jane Doe', f: 'Yes', id: '100' };
  const b = { v: '1', q: 'Q', a: 'No', d: '2026-10-07', c: 'Jane Doe', f: 'Yes', id: '101' };
  assert.equal(M.surveyHitsLong([a, b], [yes], groups, cols, 'U').hits.length, 0);
  assert.equal(M.surveyHitsLong([b, a], [yes], groups, cols, 'U').hits.length, 0);
});

test('shifts with a blank VANID stay distinct and are counted in noVanId', () => {
  const groups = [{ code: 'ALL', name: 'All', vanUsers: [], eventPrefixes: ['*'] }];
  const cols = { eventName: 'e', eventDate: 'd', status: 's', vanId: 'v', shift: null, credit: null, eventType: null };
  const rows = [1, 2, 3].map(() => ({ e: 'X', d: '2026-10-07', s: 'Completed', v: '' }));
  const e = M.shiftHits(rows, [{ key: 'done', type: 'shifts_completed', eventTypes: [] }, { key: 'active', type: 'active_volunteers', eventTypes: [] }], groups, cols, { unassignedCode: 'U', ignorePrefixes: [] });
  const weeks = M.computeWeeks('2026-10-05', '2026-11-03', 'Monday');
  const done = M.countHits(e.hits, weeks, groups, [{ key: 'done' }], '2026-10-20').find((r) => r.weekLabel === 'Oct 5 - 11');
  assert.equal(done.value, 3);
  assert.equal(e.noVanId, 3);
  assert.equal(e.hits.filter((h) => h.metric === 'active').length, 0, 'people cannot be counted without an id');
});

test('splitPeople_: "Doe, Jane" alone is one person; "jdoe, mlee" is two; "Jane Doe, Pat Smith" is two', () => {
  assert.deepEqual(splitPeople_('Doe, Jane'), ['Doe, Jane']);
  assert.deepEqual(splitPeople_('jdoe, mlee'), ['jdoe', 'mlee']);
  assert.deepEqual(splitPeople_('Jane Doe, Pat Smith'), ['Jane Doe', 'Pat Smith']);
  assert.deepEqual(splitPeople_('Doe, Jane; Smith, Pat'), ['Doe, Jane', 'Smith, Pat']);
});
