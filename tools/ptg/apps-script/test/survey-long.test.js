// Run with `npm test`. Survey metrics from VAN's Survey Response Report (one row per response).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../Metrics.js');

const groups = [{ code: 'JANE', name: 'Jane', vanUsers: ['Jane Doe'], eventPrefixes: [] }];
const cols = { question: 'survey question name', response: 'survey response', date: 'date canvassed', canvasser: 'canvassed by', vanId: 'vanid', flag: 'is most recent response', id: 'survey response id' };
const row = (o) => Object.assign({ vanid: '1', 'survey question name': '2026 Rivet Vol', 'survey response': 'Yes', 'date canvassed': '2026-10-07', 'canvassed by': 'Doe, Jane', 'is most recent response': 'Yes', 'survey response id': 'r1' }, o);
const signups = { key: 'signups', label: 'Signups', type: 'survey_first_response', valueColumn: '2026 Rivet Vol', dateColumn: '', canvasserColumn: '', responseName: '' };
const yeses = { key: 'yes', label: 'Yes', type: 'survey_current_response', valueColumn: '2026 rivet vol', dateColumn: '', canvasserColumn: '', responseName: 'Yes' };

test('isTruthy accepts VAN flag spellings', () => {
  ['Yes', 'yes', 'TRUE', '1', 'Y'].forEach((v) => assert.equal(M.isTruthy(v), true, v));
  ['No', 'false', '0', '', null].forEach((v) => assert.equal(M.isTruthy(v), false, String(v)));
});

test('only rows for the metric\'s question count; other questions on the same people are ignored', () => {
  const records = [row({}), row({ 'survey question name': '2026 Candidate Support', 'survey response': '1 - Strong Dem', 'survey response id': 'r2' })];
  const s = M.surveyHitsLong(records, [signups], groups, cols, 'UNASSIGNED');
  assert.equal(s.hits.length, 1);
  assert.deepEqual(Object.keys(s.questions).sort(), ['2026 Candidate Support', '2026 Rivet Vol']);
});

test('survey_first_response: one hit per person, in the week of the earliest response, whatever the answer', () => {
  const records = [
    row({ 'survey response': 'No', 'date canvassed': '2026-10-14', 'survey response id': 'a' }),
    row({ 'survey response': 'Yes', 'date canvassed': '2026-10-07', 'survey response id': 'b' }),
    row({ vanid: '2', 'date canvassed': '2026-10-15', 'survey response id': 'c' }),
  ];
  const s = M.surveyHitsLong(records, [signups], groups, cols, 'UNASSIGNED');
  assert.equal(s.hits.length, 2);
  assert.equal(s.hits.find((h) => h.id === '1').date, '2026-10-07');
});

test('survey_current_response: the latest response per person decides; a later "No" removes an earlier "Yes"', () => {
  const records = [
    row({ 'survey response': 'Yes', 'date canvassed': '2026-10-07', 'survey response id': 'a', 'is most recent response': 'No' }),
    row({ 'survey response': 'No', 'date canvassed': '2026-10-14', 'survey response id': 'b' }),
    row({ vanid: '2', 'survey response': 'Yes', 'date canvassed': '2026-10-15', 'survey response id': 'c' }),
  ];
  const s = M.surveyHitsLong(records, [yeses], groups, cols, 'UNASSIGNED');
  assert.deepEqual(s.hits.map((h) => h.id), ['2']);
});

test('survey_current_response: same-day responses, the most-recent flag breaks the tie', () => {
  const records = [
    row({ 'survey response': 'No', 'date canvassed': '2026-10-07', 'survey response id': 'a', 'is most recent response': 'No' }),
    row({ 'survey response': 'Yes', 'date canvassed': '2026-10-07', 'survey response id': 'b', 'is most recent response': 'Yes' }),
  ];
  assert.equal(M.surveyHitsLong(records, [yeses], groups, cols, 'UNASSIGNED').hits.length, 1);
});

test('credit goes to the canvasser\'s group; unlisted canvassers land on Unassigned', () => {
  const records = [row({}), row({ vanid: '2', 'canvassed by': 'Someone Else', 'survey response id': 'z' })];
  const s = M.surveyHitsLong(records, [signups], groups, cols, 'UNASSIGNED');
  assert.deepEqual(s.hits.map((h) => h.group).sort(), ['JANE', 'UNASSIGNED']);
  assert.equal(s.unassigned, 1);
});

test('blank responses and unreadable dates are skipped and counted', () => {
  const records = [row({ 'survey response': '' }), row({ vanid: '2', 'date canvassed': 'Oct 7', 'survey response id': 'q' })];
  const s = M.surveyHitsLong(records, [signups], groups, cols, 'UNASSIGNED');
  assert.equal(s.hits.length, 0);
  assert.equal(s.badDates, 1);
});

test('works without a most-recent flag column', () => {
  const noFlag = Object.assign({}, cols, { flag: null });
  const s = M.surveyHitsLong([row({})], [yeses], groups, noFlag, 'UNASSIGNED');
  assert.equal(s.hits.length, 1);
});

test('responseList / responseMatches: one answer, several, any', () => {
  assert.deepEqual(M.responseList('4 - Confirmed'), ['4 - confirmed']);
  assert.deepEqual(M.responseList('Yes, Maybe'), ['yes', 'maybe']);
  assert.deepEqual(M.responseList('1 - Strong Dem; 2 - Lean Dem'), ['1 - strong dem', '2 - lean dem']);
  assert.equal(M.responseMatches('maybe', { responseName: 'Yes, Maybe' }), true);
  assert.equal(M.responseMatches('No', { responseName: 'Yes, Maybe' }), false);
  assert.equal(M.responseMatches('anything', { responseName: '*' }), true);
  assert.equal(M.responseMatches('Yes', { responseName: '' }), false);
});

test('survey_current_response with an answer list counts either answer', () => {
  const either = Object.assign({}, yeses, { responseName: 'Yes; Maybe' });
  const records = [row({}), row({ vanid: '2', 'survey response': 'Maybe', 'survey response id': 'm' }), row({ vanid: '3', 'survey response': 'No', 'survey response id': 'n' })];
  assert.equal(M.surveyHitsLong(records, [either], groups, cols, 'UNASSIGNED').hits.length, 2);
});
