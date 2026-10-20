// Run with `npm test`. Setup list parsing.
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitList_, splitPeople_ } = require('../Config.js');

test('splitList_ splits on commas and trims', () => {
  assert.deepEqual(splitList_(' CMPA_, CMPB_ ,,'), ['CMPA_', 'CMPB_']);
  assert.deepEqual(splitList_(''), []);
  assert.deepEqual(splitList_(null), []);
});

test('splitPeople_ uses commas unless semicolons or line breaks are present', () => {
  assert.deepEqual(splitPeople_('jdoe, mlee'), ['jdoe', 'mlee']);
  assert.deepEqual(splitPeople_('Jane Doe, Pat Smith'), ['Jane Doe', 'Pat Smith']);
  assert.deepEqual(splitPeople_('Doe, Jane; Smith, Pat'), ['Doe, Jane', 'Smith, Pat']);
  assert.deepEqual(splitPeople_('Doe, Jane\nSmith, Pat'), ['Doe, Jane', 'Smith, Pat']);
  assert.deepEqual(splitPeople_('Doe, Jane;'), ['Doe, Jane']);
});

const { normalizeType, metricTypes_ } = require('../Config.js');

test('normalizeType: canonical names, close variants, case and spaces; unknown is null', () => {
  metricTypes_().forEach((t) => assert.equal(normalizeType(t), t));
  assert.equal(normalizeType('shifts_complete'), 'shifts_completed');
  assert.equal(normalizeType('Shifts Completed'), 'shifts_completed');
  assert.equal(normalizeType('completed shifts'), 'shifts_completed');
  assert.equal(normalizeType('no shows'), 'shifts_flaked');
  assert.equal(normalizeType('flakes'), 'shifts_flaked');
  assert.equal(normalizeType('active'), 'active_volunteers');
  assert.equal(normalizeType('New Volunteer'), 'new_volunteers');
  assert.equal(normalizeType('current response'), 'survey_current_response');
  assert.equal(normalizeType('first_response'), 'survey_first_response');
  assert.equal(normalizeType('signups'), null, 'a business word is not a rule');
  assert.equal(normalizeType(''), null);
  assert.equal(normalizeType('doors_knocked'), null);
});
