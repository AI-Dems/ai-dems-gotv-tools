// Run with `npm test`. The shift-based metric types and the event-type filter.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../Metrics.js');

const groups = [{ code: 'JANE', name: 'Jane', vanUsers: ['Jane Doe'], eventPrefixes: ['*'] }];
const cols = { eventName: 'event name', eventDate: 'event date', status: 'status', vanId: 'vanid', shift: 'shift start time', credit: 'recruited by', eventType: 'event type' };
const opts = { unassignedCode: 'UNASSIGNED', ignorePrefixes: ['[Cancelled]'], today: '2026-10-20' };
const row = (o) => Object.assign({ vanid: '1', 'event name': 'Saginaw_Canvass', 'event date': '2026-10-07', status: 'Completed', 'shift start time': '10:00', 'recruited by': '', 'event type': 'Canvass' }, o);
const m = (key, type, eventTypes) => ({ key, label: key, type, eventTypes: eventTypes || [] });
const count = (e, key) => e.hits.filter((h) => h.metric === key).length;
const weeks = M.computeWeeks('2026-09-28', '2026-11-03', 'Monday');
const value = (e, metrics, key, week, group) => M.countHits(e.hits, weeks, groups.concat([{ code: 'UNASSIGNED' }]), metrics, '2026-10-26').find((r) => r.metric === key && r.weekLabel === week && r.group === (group || 'JANE')).value;

test('isShiftMetric and SHIFT_TYPES', () => {
  assert.ok(M.isShiftMetric(m('a', 'shifts_scheduled')));
  assert.ok(!M.isShiftMetric(m('a', 'survey_first_response')));
  assert.deepEqual(M.SHIFT_TYPES, ['shifts_completed', 'shifts_scheduled', 'shifts_flaked', 'active_volunteers', 'new_volunteers']);
});

test('shifts_scheduled counts commitments by event date: scheduled, confirmed, web variants, completed, no show; not declined', () => {
  const metrics = [m('sched', 'shifts_scheduled')];
  const records = ['Scheduled', 'Confirmed', 'Sched-Web', 'Confrm-Web', 'Completed', 'No Show', 'Declined', 'DeclineWeb', 'Invited'].map((s, i) => row({ vanid: String(i), status: s }));
  const e = M.shiftHits(records, metrics, groups, cols, opts);
  assert.equal(count(e, 'sched'), 6);
  assert.equal(e.completed, 1, 'tallies still describe completed shifts only');
});

test('shifts_scheduled includes future weeks the dashboard will show once they start', () => {
  const metrics = [m('sched', 'shifts_scheduled')];
  const e = M.shiftHits([row({ status: 'Scheduled', 'event date': '2026-10-28' })], metrics, groups, cols, opts);
  assert.equal(count(e, 'sched'), 1);
  assert.equal(M.countHits(e.hits, weeks, groups, metrics, '2026-10-20').filter((r) => r.weekLabel === 'Oct 26 - Nov 3').length, 0, 'not shown before the week starts');
  assert.equal(value(e, metrics, 'sched', 'Oct 26 - Nov 3'), 1, 'shown once it has');
});

test('shifts_flaked counts No Show only', () => {
  const metrics = [m('flake', 'shifts_flaked')];
  const records = [row({ vanid: '1', status: 'No Show' }), row({ vanid: '2', status: 'no-show' }), row({ vanid: '3', status: 'Declined' }), row({ vanid: '4', status: 'Completed' })];
  assert.equal(count(M.shiftHits(records, metrics, groups, cols, opts), 'flake'), 2);
});

test('active_volunteers is distinct people per week; shifts_completed counts each shift', () => {
  const metrics = [m('active', 'active_volunteers'), m('done', 'shifts_completed')];
  const records = [
    row({ vanid: '1', 'event date': '2026-10-06' }), row({ vanid: '1', 'event date': '2026-10-08' }),   // same week, two shifts
    row({ vanid: '2', 'event date': '2026-10-07' }),
    row({ vanid: '1', 'event date': '2026-10-14' }),                                                  // next week
  ];
  const e = M.shiftHits(records, metrics, groups, cols, opts);
  assert.equal(value(e, metrics, 'active', 'Oct 5 - 11'), 2);
  assert.equal(value(e, metrics, 'done', 'Oct 5 - 11'), 3);
  assert.equal(value(e, metrics, 'active', 'Oct 12 - 18'), 1);
});

test('new_volunteers counts a person once, in the week of their first Completed shift, credited to that shift', () => {
  const metrics = [m('new', 'new_volunteers')];
  const records = [
    row({ vanid: '1', 'event date': '2026-10-14' }), row({ vanid: '1', 'event date': '2026-10-06' }), row({ vanid: '1', 'event date': '2026-10-20' }),
    row({ vanid: '2', 'event date': '2026-10-14', status: 'Scheduled' }),                            // never completed: not new yet
  ];
  const e = M.shiftHits(records, metrics, groups, cols, opts);
  assert.equal(count(e, 'new'), 1);
  assert.equal(value(e, metrics, 'new', 'Oct 5 - 11'), 1);
  assert.equal(value(e, metrics, 'new', 'Oct 12 - 18'), 0);
});

test('event_type filter: only matching rows count, case-insensitive, several values allowed', () => {
  const metrics = [m('canvass', 'shifts_completed', ['Canvass']), m('phones', 'shifts_completed', ['Phone Bank', 'phone bank shift']), m('all', 'shifts_completed')];
  const records = [row({ vanid: '1', 'event type': 'Canvass' }), row({ vanid: '2', 'event type': 'PHONE BANK' }), row({ vanid: '3', 'event type': 'One on One' })];
  const e = M.shiftHits(records, metrics, groups, cols, opts);
  assert.equal(count(e, 'canvass'), 1);
  assert.equal(count(e, 'phones'), 1);
  assert.equal(count(e, 'all'), 3);
});

test('event_type filter with no event-type column in the export counts nothing (the run warns)', () => {
  const noType = Object.assign({}, cols, { eventType: null });
  const e = M.shiftHits([row({})], [m('canvass', 'shifts_completed', ['Canvass'])], groups, noType, opts);
  assert.equal(count(e, 'canvass'), 0);
  assert.equal(M.matchesEventType(row({}), m('x', 'shifts_completed', []), noType), true, 'blank filter still passes');
});

test('cancelled events are skipped for every shift metric', () => {
  const metrics = M.SHIFT_TYPES.map((t) => m(t, t));
  const e = M.shiftHits([row({ 'event name': '[Cancelled] X', status: 'Scheduled' }), row({ 'event name': '[Cancelled] Y' })], metrics, groups, cols, opts);
  assert.equal(e.hits.length, 0);
  assert.equal(e.ignored, 1);
});

test('unassigned applies to the other shift metrics too', () => {
  const noGroups = [{ code: 'JANE', name: 'Jane', vanUsers: ['Jane Doe'], eventPrefixes: ['Saginaw_'] }];
  const metrics = [m('sched', 'shifts_scheduled'), m('new', 'new_volunteers')];
  const e = M.shiftHits([row({ 'event name': 'Random', status: 'Scheduled' }), row({ vanid: '2', 'event name': 'Random' })], metrics, noGroups, cols, opts);
  assert.deepEqual(e.hits.map((h) => h.group), ['UNASSIGNED', 'UNASSIGNED', 'UNASSIGNED'], 'scheduled ×2 (Completed is also a commitment) + new ×1');
});
