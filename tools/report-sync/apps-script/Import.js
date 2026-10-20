/**
 * Import.js — turns a Votebuilder export (the zip from My Export Files, or
 * the .xls / .csv inside it) into rows, and puts them in a tab.
 *
 * Votebuilder's ".xls" is UTF-16 tab-separated text, not a workbook. Its
 * ".csv" starts with a "sep=," line and leaves some comma-containing fields
 * unquoted, so .xls is the format the docs recommend.
 */

var HEADER_PROP_PREFIX = 'HEADER:';

/** Called by Upload.html. `b64` is the file's bytes; returns a summary for the dialog. */
function importUpload(b64, filename, tab) {
  tab = String(tab || '').trim();
  if (!tab) throw new Error('Pick a tab.');
  if (RESERVED_TABS.indexOf(tab) >= 0) throw new Error('"' + tab + '" is reserved; pick another tab.');
  var bytes = Utilities.base64Decode(b64);
  var file = unwrapExport_(bytes, filename);
  var rows = parseExport(decodeExport_(file.bytes), file.format);
  if (!rows.length) throw new Error(file.name + ' is empty.');
  var n = replaceTab_(tab, rows);
  rememberHeader_(tab, rows[0]);
  log_([{ report: file.name, database: 'upload', tab: tab, file: filename, rows: n, status: 'OK' }]);
  return { tab: tab, rows: n, columns: rows[0].length, file: file.name };
}

/** Called by Upload.html: the tabs to offer, and which one the header suggests. */
function uploadChoices(b64, filename) {
  var tabs = configuredTabs_();
  var suggested = '';
  if (b64) {
    try {
      var file = unwrapExport_(Utilities.base64Decode(b64), filename);
      var header = parseExport(decodeExport_(file.bytes), file.format)[0] || [];
      suggested = tabForHeader_(header);
    } catch (e) { /* no suggestion; the dialog still lets them pick */ }
  }
  return { tabs: tabs, suggested: suggested };
}

/* ---------- the file ---------- */

/** {bytes, name, format} for the export inside `bytes`, unzipping if needed. */
function unwrapExport_(bytes, filename) {
  var isZip = bytes.length > 1 && bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  if (isZip) {
    var entries = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', filename));
    var hits = entries.filter(function (b) { return /\.(xls|csv)$/i.test(b.getName()); });
    if (hits.length !== 1) throw new Error('Expected one .xls or .csv inside the zip, found ' + hits.length + '.');
    return { bytes: hits[0].getBytes(), name: hits[0].getName(), format: formatOf_(hits[0].getName()) };
  }
  var format = formatOf_(filename);
  if (!format) throw new Error('Upload the .zip from My Export Files, or the .xls / .csv inside it.');
  return { bytes: bytes, name: filename, format: format };
}

function formatOf_(name) {
  var m = /\.(xls|csv)$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : null;
}

/** Text of an export, honoring a UTF-16 or UTF-8 byte-order mark. */
function decodeExport_(bytes) {
  var b0 = bytes[0] & 0xff, b1 = bytes[1] & 0xff, b2 = bytes[2] & 0xff, b3 = bytes[3] & 0xff;
  if (b0 === 0xd0 && b1 === 0xcf && b2 === 0x11 && b3 === 0xe0) {
    throw new Error('This is a binary Excel workbook. Export from Votebuilder as Excel (.xls) or CSV instead.');
  }
  if (b0 === 0xff && b1 === 0xfe) return Utilities.newBlob(bytes.slice(2)).getDataAsString('UTF-16LE');
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) return Utilities.newBlob(bytes.slice(3)).getDataAsString('UTF-8');
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
}

/* ---------- parsing (pure; tested in Node) ---------- */

/** Every line of the export as an array of strings. Drops a leading "sep=" line. */
function parseExport(text, format) {
  var rows = parseDelimited(text, format === 'csv' ? ',' : '\t');
  if (rows.length && /^sep=/i.test(String(rows[0][0]))) rows.shift();
  while (rows.length && rows[rows.length - 1].every(function (c) { return c === ''; })) rows.pop();
  return rows;
}

/** A small RFC-4180-style parser: quotes, doubled quotes, CRLF, stray quotes inside fields. */
function parseDelimited(text, delim) {
  var rows = [], row = [], field = '', inQuotes = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ---------- remembering which tab an export belongs to ---------- */

function headerKey_(header) {
  return HEADER_PROP_PREFIX + header.map(function (h) { return String(h).trim().toLowerCase(); }).join('\t').slice(0, 2000);
}

function rememberHeader_(tab, header) {
  PropertiesService.getDocumentProperties().setProperty(headerKey_(header), tab);
}

function tabForHeader_(header) {
  return PropertiesService.getDocumentProperties().getProperty(headerKey_(header)) || '';
}

/** Tabs from the Reports table on Setup, plus any existing non-reserved tabs. */
function configuredTabs_() {
  var seen = {}, out = [];
  var add = function (t) { if (t && !seen[t] && RESERVED_TABS.indexOf(t) < 0) { seen[t] = true; out.push(t); } };
  try { readConfig().reports.forEach(function (r) { add(r.tab); }); } catch (e) { /* Setup not built yet */ }
  SpreadsheetApp.getActive().getSheets().forEach(function (s) { add(s.getName()); });
  return out;
}

// Node export for tests; ignored by Apps Script.
if (typeof module !== 'undefined') {
  module.exports = { parseExport: parseExport, parseDelimited: parseDelimited };
}
