// Tests for Sheet.js: how a tab is resized and cleared when its data is replaced.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { replacePlan } = require('../Sheet.js');

// replacePlan(rowCount, columnCount, height, width): what to grow and what to clear so
// the new data fully replaces the old without shrinking the sheet.

test('replacePlan: a smaller export clears the leftover rows below and columns to the right', () => {
  assert.deepEqual(replacePlan(1000, 26, 5, 8), {
    grow: null,
    clears: [
      { row: 6, col: 1, rows: 995, cols: 26 },
      { row: 1, col: 9, rows: 5, cols: 18 }
    ]
  });
});

test('replacePlan: a larger export grows the sheet and has nothing to clear', () => {
  assert.deepEqual(replacePlan(10, 5, 50, 8), { grow: { rows: 40, cols: 3 }, clears: [] });
});

test('replacePlan: an export that exactly fits needs no growing and no clearing', () => {
  assert.deepEqual(replacePlan(5, 8, 5, 8), { grow: null, clears: [] });
});
