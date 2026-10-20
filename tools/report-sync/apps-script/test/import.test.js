// Tests for Import.js: turning a Votebuilder export (.xls / .csv text) into rows.
// Fixtures are built in code from obviously fake data; there are no real people here.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseExport, parseDelimited } = require('../Import.js');

// Mirrors decodeExport_ in Import.js. Apps Script's decodeExport_ uses
// Utilities.newBlob, which doesn't exist in Node, so this is a stand-in with
// the same byte-order-mark handling. Keep the two in step.
function decodeExport(buf) {
  if (buf.subarray(0, 4).toString('hex') === 'd0cf11e0') throw new Error('binary workbook');
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  return buf.toString('utf8');
}

const HEADER = ['VANID', 'Name', 'Last Name', 'Preferred Phone', 'Shift Date', 'Status', 'Zip', 'Notes'];
const ROWS = [
  ['100000001', 'Test Volunteer One', 'Volunteer, One', 'PHONE-1', '10/20/2026', 'Scheduled', '48823', 'plain'],
  ['100000002', 'Test Volunteer Two', 'Volunteer, Two', 'PHONE-2', '10/20/2026', 'Completed', '48823-1234', 'He said "hi" mid-field'],
  ['100000003', 'Test Volunteer Three', 'Volunteer, Three', '', '10/21/2026', 'Scheduled', '48824', '"quoted, with comma"'],
  ['100000004', 'Test Volunteer Four', 'Volunteer, Four', 'PHONE-4', '10/21/2026', '', '48825', '']
];

// Votebuilder's ".xls": UTF-16LE with a BOM, tab-separated, CRLF, and a trailing blank line.
function xlsBytes() {
  const tsv = [HEADER].concat(ROWS).map((r) => r.join('\t')).join('\r\n') + '\r\n\r\n';
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tsv, 'utf16le')]);
}

// Votebuilder's ".csv": UTF-8 BOM and a "sep=," line. It leaves "Last, First"
// unquoted on the first row and quotes it on the second.
function csvBytes() {
  const lines = [
    'sep=,',
    HEADER.join(','),
    '100000001,Test Volunteer One,Volunteer, One,PHONE-1,10/20/2026,Scheduled,48823,plain',
    '100000002,Test Volunteer Two,"Volunteer, Two",PHONE-2,10/20/2026,Completed,48823-1234,"He said ""hi"""'
  ];
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n') + '\r\n')]);
}

test('xls: header plus 4 data rows, trailing blank rows dropped, commas and mid-field quotes intact', () => {
  const rows = parseExport(decodeExport(xlsBytes()), 'xls');
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], HEADER);
  assert.equal(rows[1][2], 'Volunteer, One');
  assert.equal(rows[2][7], 'He said "hi" mid-field');
  assert.equal(rows[3][7], 'quoted, with comma'); // a fully quoted field loses its quotes
  assert.equal(rows[4][5], ''); // empty cell preserved
  assert.ok(rows.every((r) => r.length === 8), 'every row has 8 columns');
});

test('csv: the sep= line is dropped', () => {
  const rows = parseExport(decodeExport(csvBytes()), 'csv');
  assert.equal(rows.length, 3);
  assert.equal(rows[0][0], 'VANID');
});

test('csv: documents that an unquoted "Last, First" row shifts right by one field (a Votebuilder quirk)', () => {
  const rows = parseExport(decodeExport(csvBytes()), 'csv');
  assert.equal(rows[1].length, 9, 'row with an unquoted comma has 9 fields');
  assert.equal(rows[2].length, 8, 'the quoted row parses normally');
  assert.equal(rows[2][7], 'He said "hi"');
});

test('a binary Excel workbook is refused by the decode step', () => {
  const workbook = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
  assert.throws(() => decodeExport(workbook), /binary/);
});

test('parseExport drops every trailing all-empty row', () => {
  assert.deepEqual(parseExport('a\tb\r\n1\t2\r\n\r\n\r\n', 'xls'), [['a', 'b'], ['1', '2']]);
});

test('parseDelimited: CRLF, LF and CR line endings, doubled quotes, empty trailing field', () => {
  assert.deepEqual(
    parseDelimited('a,b\r\nc,""\n"x""y",\rz', ','),
    [['a', 'b'], ['c', ''], ['x"y', ''], ['z']]
  );
});
