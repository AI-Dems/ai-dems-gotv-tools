// Run with `npm test`. Accumulating survey imports: multi-page pastes, duplicates, headerless pastes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeImportRows, headerRowIndex } = require('../Import.js');

const NAMES = ['VANID', 'VanID'];
const H = ['VANID', 'Survey Question Name', 'Survey Response', 'Date Canvassed', 'Canvassed By', 'Survey Response ID'];
const r = (id, vanid, resp, date) => [vanid, '2026 Rivet Vol', resp, date, 'Doe, Jane', id];

test('headerRowIndex finds the header or returns -1', () => {
  assert.equal(headerRowIndex([H, r('a', '1', 'Yes', '2026-10-07')], NAMES), 0);
  assert.equal(headerRowIndex([['SEP=', ''], H], NAMES), 1);
  assert.equal(headerRowIndex([r('a', '1', 'Yes', '2026-10-07')], NAMES), -1);
});

test('first import: rows are kept as they are', () => {
  const m = mergeImportRows([], [H, r('a', '1', 'Yes', '2026-10-07')], 'survey response id', NAMES);
  assert.equal(m.added, 1); assert.equal(m.skipped, 0); assert.equal(m.rows.length, 2);
});

test('second paste adds new rows, skips duplicates by Survey Response ID, drops the repeated header', () => {
  const page1 = [H, r('a', '1', 'Yes', '2026-10-07'), r('b', '2', 'No', '2026-10-08')];
  const page2 = [H, r('b', '2', 'No', '2026-10-08'), r('c', '3', 'Yes', '2026-10-09')];
  const first = mergeImportRows([], page1, 'survey response id', NAMES).rows;
  const m = mergeImportRows(first, page2, 'survey response id', NAMES);
  assert.equal(m.added, 1); assert.equal(m.skipped, 1); assert.equal(m.rows.length, 4);
  assert.equal(m.rows.filter((x) => x[0] === 'VANID').length, 1);
});

test('a paste without a header is taken as data under the existing header', () => {
  const first = mergeImportRows([], [H, r('a', '1', 'Yes', '2026-10-07')], 'survey response id', NAMES).rows;
  const m = mergeImportRows(first, [r('d', '4', 'Yes', '2026-10-10')], 'survey response id', NAMES);
  assert.equal(m.added, 1); assert.equal(m.rows.length, 3);
});

test('without an id column, duplicates are judged by every cell', () => {
  const m1 = mergeImportRows([], [H, r('', '1', 'Yes', '2026-10-07')], null, NAMES).rows;
  const m = mergeImportRows(m1, [H, r('', '1', 'Yes', '2026-10-07'), r('', '1', 'Yes', '2026-10-08')], null, NAMES);
  assert.equal(m.added, 1); assert.equal(m.skipped, 1);
});

test('columns are matched by name; a different column order and an extra column are handled', () => {
  const first = mergeImportRows([], [H, r('a', '1', 'Yes', '2026-10-07')], 'survey response id', NAMES).rows;
  const H2 = ['Survey Response ID', 'VANID', 'Survey Response', 'Survey Question Name', 'Date Canvassed', 'Canvassed By', 'Is Most Recent Response'];
  const m = mergeImportRows(first, [H2, ['e', '5', 'Yes', '2026 Rivet Vol', '2026-10-11', 'Doe, Jane', 'Yes']], 'survey response id', NAMES);
  assert.equal(m.rows[0].length, 7);
  assert.equal(m.rows[0][6], 'Is Most Recent Response');
  const added = m.rows[2];
  assert.equal(added[0], '5'); assert.equal(added[5], 'e'); assert.equal(added[6], 'Yes');
  assert.equal(m.rows[1][6], '', 'older rows get a blank in the new column');
});

test('blank rows are ignored', () => {
  const m = mergeImportRows([], [H, ['', '', '', '', '', ''], r('a', '1', 'Yes', '2026-10-07')], 'survey response id', NAMES);
  assert.equal(m.rows.length, 2);
});

const KEY = ['vanid', 'survey question name', 'survey response', 'date canvassed', 'canvassed by'];

test('natural key: the same response pasted with a different date format and an extra column is a duplicate', () => {
  const first = mergeImportRows([], [H, r('', '1', 'Yes', '2026-10-07')], null, NAMES, KEY).rows;
  const H2 = H.concat(['Is Most Recent Response']);
  const m = mergeImportRows(first, [H2, r('', '1', 'Yes', '10/7/2026 2:03:00 PM').concat(['Yes'])], null, NAMES, KEY);
  assert.equal(m.skipped, 1); assert.equal(m.added, 0); assert.equal(m.method, 'natural');
});

test('natural key: a different answer or date on the same person is a new row', () => {
  const first = mergeImportRows([], [H, r('', '1', 'Yes', '2026-10-07')], null, NAMES, KEY).rows;
  const m = mergeImportRows(first, [H, r('', '1', 'No', '2026-10-07'), r('', '1', 'Yes', '2026-10-08')], null, NAMES, KEY);
  assert.equal(m.added, 2);
});

test('method is "id" when the id column exists, "cells" when neither id nor the full natural key is present', () => {
  assert.equal(mergeImportRows([], [H, r('a', '1', 'Yes', '2026-10-07')], 'survey response id', NAMES, KEY).method, 'id');
  const H3 = ['VANID', 'Survey Response'];
  assert.equal(mergeImportRows([], [H3, ['1', 'Yes']], null, NAMES, KEY).method, 'cells');
});

test('same id with a changed answer or flag refreshes the stored row (no stale most-recent flag)', () => {
  const first = mergeImportRows([], [H, r('a', '1', 'Yes', '2026-10-07')], 'survey response id', NAMES, KEY).rows;
  const m = mergeImportRows(first, [H, r('a', '1', 'No', '2026-10-07')], 'survey response id', NAMES, KEY);
  assert.equal(m.updated, 1); assert.equal(m.added, 0); assert.equal(m.skipped, 0);
  assert.equal(m.rows.length, 2); assert.equal(m.rows[1][2], 'No');
  const again = mergeImportRows(m.rows, [H, r('a', '1', 'No', '2026-10-07')], 'survey response id', NAMES, KEY);
  assert.equal(again.skipped, 1, 'an identical re-send is a plain duplicate');
});

const ALIASES = [['VANID', 'VanID'], ['Survey Question Name', 'Survey Question', 'Question'], ['Survey Response', 'Response'], ['Date Canvassed', 'Date'], ['Canvassed By', 'Canvasser'], ['Is Most Recent Response'], ['Survey Response ID', 'Response ID']];

test('a paste whose headers are spelled differently lands in the same columns, not new ones', () => {
  const first = mergeImportRows([], [H, r('a', '1', 'Yes', '2026-10-07')], 'survey response id', NAMES, KEY, ALIASES).rows;
  const H2 = ['VanID', 'Survey Question', 'Response', 'Date', 'Canvasser', 'Response ID'];
  const m = mergeImportRows(first, [H2, ['2', '2026 Rivet Vol', 'Yes', '2026-10-08', 'Doe, Jane', 'b']], 'survey response id', NAMES, KEY, ALIASES);
  assert.equal(m.rows[0].length, 6, 'no extra columns');
  assert.equal(m.rows[2][1], '2026 Rivet Vol'); assert.equal(m.rows[2][5], 'b');
});

test('a later paste without the ID column does not re-add rows stored with an ID (both keys remembered)', () => {
  const first = mergeImportRows([], [H, r('a', '1', 'Yes', '2026-10-07')], 'survey response id', NAMES, KEY).rows;
  const H2 = H.slice(0, 5);
  const m = mergeImportRows(first, [H2, r('', '1', 'Yes', '2026-10-07').slice(0, 5), r('', '2', 'Yes', '2026-10-09').slice(0, 5)], 'survey response id', NAMES, KEY);
  assert.equal(m.skipped, 1); assert.equal(m.added, 1);
});
