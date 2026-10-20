// Run with `npm test`. Covers the pure parts of Import.js: VAN's "SEP=" first
// line and finding the header row. Nothing here touches Sheets.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stripSepLine, findHeaderRow } = require('../Import.js');

const VANID_NAMES = ['VANID', 'VanID', 'Voter File VANID', 'MyCampaign ID', 'Van ID', 'ID'];

// Shape of a VAN Event Participant Report download (Oct 2026): a SEP= line,
// then the header, then one row per signup. Values are made up.
const EVENT_REPORT =
  'SEP=,\r\n' +
  'VANID,Contact Name,Signup Date,Status,Role,Event Name,Event Type,Event Date,Shift Start Time,Shift End Time,Location Name,Recruited By\r\n' +
  '100000001,Test Person,2026-10-01,Completed,Volunteer,Daily_Canvass_Test,Canvass,2026-10-07,2026-10-07 10:00:00.0000000 -04:00,2026-10-07 13:00:00.0000000 -04:00,Test Office,Test Staffer\r\n';

test('stripSepLine removes VAN\'s SEP= line and reports the delimiter', () => {
  const out = stripSepLine(EVENT_REPORT);
  assert.equal(out.delimiter, ',');
  assert.ok(out.text.startsWith('VANID,Contact Name'));
});

test('stripSepLine handles lower case, other separators, tabs and a BOM already removed', () => {
  assert.equal(stripSepLine('sep=;\nA;B\n1;2\n').delimiter, ';');
  assert.equal(stripSepLine('SEP=\t\nA\tB\n1\t2\n').delimiter, '\t');
  assert.equal(stripSepLine('SEP=,\nVANID\n').text, 'VANID\n');
});

test('stripSepLine leaves a file with no SEP= line alone', () => {
  const text = 'VANID,Event Name\n1,X\n';
  assert.deepEqual(stripSepLine(text), { text, delimiter: null });
  assert.equal(stripSepLine('Separate,Column\n1,2\n').delimiter, null);
});

test('findHeaderRow finds the header below a SEP= row (what File → Import leaves on the tab)', () => {
  const rows = [['SEP=', '', ''], ['VANID', 'Event Name', 'Status'], ['1', 'X', 'Completed']];
  assert.equal(findHeaderRow(rows, VANID_NAMES), 1);
});

test('findHeaderRow is 0 for a clean export', () => {
  assert.equal(findHeaderRow([['VanID', 'Event Name'], ['1', 'X']], VANID_NAMES), 0);
});

test('findHeaderRow skips a report title and blank rows, matching case-insensitively', () => {
  const rows = [['Event Participant Report', ''], ['', ''], ['vanid', 'event name'], ['1', 'X']];
  assert.equal(findHeaderRow(rows, VANID_NAMES), 2);
});

test('findHeaderRow uses a configured VanID header too', () => {
  const rows = [['SEP=', ''], ['Person Number', 'Event Name'], ['1', 'X']];
  assert.equal(findHeaderRow(rows, VANID_NAMES.concat(['Person Number'])), 1);
});

test('findHeaderRow without any VanID-type header still skips sep= and blank rows', () => {
  assert.equal(findHeaderRow([['sep=', ''], ['Name', 'Event Name'], ['A', 'X']], VANID_NAMES), 1);
  assert.equal(findHeaderRow([['', ''], ['Name', 'Event Name']], VANID_NAMES), 1);
  assert.equal(findHeaderRow([['Name', 'Event Name'], ['A', 'X']], VANID_NAMES), 0);
  assert.equal(findHeaderRow([], VANID_NAMES), 0);
});

test('findHeaderRow treats a VanID header past the first 20 rows as not found', () => {
  const rows = Array.from({ length: 25 }, () => ['junk', '']).concat([['VANID', 'Event Name']]);
  assert.equal(findHeaderRow(rows, VANID_NAMES), 0);
});

test('end to end on the event report text: after stripping, the first row is the header', () => {
  const { text, delimiter } = stripSepLine(EVENT_REPORT);
  const rows = text.trim().split(/\r?\n/).map((l) => l.split(delimiter));
  const start = findHeaderRow(rows, VANID_NAMES);
  assert.equal(start, 0);
  assert.ok(rows[start].includes('Event Name'), 'the header row is the one with Event Name, so the file is filed as the shifts export');
  assert.equal(rows.length - start - 1, 1);
});
