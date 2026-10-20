// A small stand-in for the Google Sheets / Apps Script services, strict where the real one is:
// range bounds, setValues dimensions, frozen panes over merged cells, column widths past the
// sheet's edge. Used by sheets-flow.test.js to run the real menu functions end to end in Node.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  each(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j); return this; }
  setValues(v) {
    if (!Array.isArray(v) || v.length !== this.nr || v.some((row) => row.length !== this.nc)) throw new Error(`The number of rows or columns in the data does not match the number of rows or columns in the range. The data has ${v.length} but the range has ${this.nr}. (${v[0] && v[0].length} vs ${this.nc} columns)`);
    v.forEach((row, i) => row.forEach((val, j) => {
      const f = this.sheet.formats[`${this.r + i},${this.c + j}`];
      this.sheet.set(this.r + i, this.c + j, f === '@' && val !== '' && val != null ? String(val) : val);   // plain-text cells hold text, as in Sheets
    }));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sheet.get(this.r + i, this.c + j)); out.push(row); } return out; }
  getValue() { return this.getValues()[0][0]; }
  setNumberFormat(f) { return this.each((r, c) => { this.sheet.formats[`${r},${c}`] = f; }); }
  setNote(n) { return this.each((r, c) => { this.sheet.notes[`${r},${c}`] = n; }); }
  getNote() { return this.sheet.notes[`${this.r},${this.c}`] || ''; }
  setDataValidation(rule) { return this.each((r, c) => { if (rule) this.sheet.validations[`${r},${c}`] = rule; else delete this.sheet.validations[`${r},${c}`]; }); }
  clearDataValidations() { return this.setDataValidation(null); }
  merge() {
    for (const m of this.sheet.merges) if (overlaps(m, this)) throw new Error('You must select all cells in a merged range to merge or unmerge them.');
    this.sheet.merges.push({ r: this.r, c: this.c, nr: this.nr, nc: this.nc }); return this;
  }
  breakApart() { this.sheet.merges = this.sheet.merges.filter((m) => !overlaps(m, this)); return this; }
}
['setFontWeight', 'setFontSize', 'setFontColor', 'setFontStyle', 'setBackground', 'setHorizontalAlignment', 'setWrap'].forEach((m) => { FakeRange.prototype[m] = function () { return this; }; });
function overlaps(a, b) { return a.r < b.r + b.nr && b.r < a.r + a.nr && a.c < b.c + b.nc && b.c < a.c + a.nc; }

class FakeSheet {
  constructor(ss, name) { Object.assign(this, { ss, name, maxRows: 1000, maxCols: 26, cells: new Map(), formats: {}, notes: {}, validations: {}, merges: [], frozenRows: 0, frozenCols: 0, hidden: false, cfRules: [] }); }
  setConditionalFormatRules(rules) { this.cfRules = rules.slice(); return this; }
  getConditionalFormatRules() { return this.cfRules.slice(); }
  key(r, c) { return `${r},${c}`; }
  set(r, c, v) { if (v === '' || v == null) this.cells.delete(this.key(r, c)); else this.cells.set(this.key(r, c), v); }
  get(r, c) { return this.cells.has(this.key(r, c)) ? this.cells.get(this.key(r, c)) : ''; }
  getName() { return this.name; }
  setName(n) { if (this.ss.sheets.some((s) => s !== this && s.name === n)) throw new Error(`A sheet with the name "${n}" already exists. Please enter another name.`); this.name = n; return this; }
  getParent() { return this.ss; }
  getMaxRows() { return this.maxRows; } getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(after, n) { if (after < 1 || after > this.maxCols) throw new Error('Those columns are out of bounds.'); this.maxCols += n; return this; }
  insertRowsAfter(after, n) { if (after < 1 || after > this.maxRows) throw new Error('Those rows are out of bounds.'); this.maxRows += n; return this; }
  getLastRow() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, +k.split(',')[0]); return m; }
  getLastColumn() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, +k.split(',')[1]); return m; }
  getRange(a, b, c, d) {
    if (typeof a === 'string') { const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a); if (!m) throw new Error('bad A1: ' + a); const col = (s) => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); const r1 = +m[2], c1 = col(m[1]), r2 = m[4] ? +m[4] : r1, c2 = m[3] ? col(m[3]) : c1; return this.getRange(r1, c1, r2 - r1 + 1, c2 - c1 + 1); }
    const r = a, cc = b, nr = c == null ? 1 : c, nc = d == null ? 1 : d;
    if (r < 1 || cc < 1 || nr < 1 || nc < 1) throw new Error('The coordinates or dimensions of the range are invalid.');
    if (r + nr - 1 > this.maxRows) throw new Error('Those rows are out of bounds.');
    if (cc + nc - 1 > this.maxCols) throw new Error('Those columns are out of bounds.');
    return new FakeRange(this, r, cc, nr, nc);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  clear() { this.cells.clear(); this.formats = {}; this.merges = []; return this; }
  clearContents() { this.cells.clear(); return this; }
  clearFormats() { this.formats = {}; return this; }
  clearNotes() { this.notes = {}; return this; }
  clearDataValidations() { this.validations = {}; return this; }
  hideSheet() { this.hidden = true; return this; } showSheet() { this.hidden = false; return this; }
  setFrozenRows(n) { this.frozenRows = n; return this; }
  setFrozenColumns(n) {
    for (const m of this.merges) if (m.c <= n && m.c + m.nc - 1 > n) throw new Error("Sorry, you can't freeze columns which contain only part of a merged cell. Try to break apart merged cells or freeze more columns to include the complete merged cells.");
    this.frozenCols = n; return this;
  }
  setColumnWidth(col, w) { if (col < 1 || col > this.maxCols) throw new Error('Those columns are out of bounds.'); return this; }
  appendRow(vals) { const r = this.getLastRow() + 1; this.getRange(r, 1, 1, vals.length).setValues([vals]); return this; }
  deleteRows(start, n) { if (start + n - 1 > this.maxRows) throw new Error('Those rows are out of bounds.'); const next = new Map(); for (const [k, v] of this.cells) { let [r, c] = k.split(',').map(Number); if (r >= start && r < start + n) continue; if (r >= start + n) r -= n; next.set(`${r},${c}`, v); } this.cells = next; this.maxRows -= n; return this; }
}

class FakeSpreadsheet {
  constructor() { this.sheets = []; this.active = null; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { if (this.getSheetByName(n)) throw new Error(`A sheet with the name "${n}" already exists.`); const s = new FakeSheet(this, n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
  getSheets() { return this.sheets.slice(); }
  getSpreadsheetTimeZone() { return 'America/New_York'; }
  setActiveSheet(s) { this.active = s; return s; }
  moveActiveSheet(pos) { const s = this.active; this.sheets = this.sheets.filter((x) => x !== s); this.sheets.splice(pos - 1, 0, s); }
}

function parseCsv(text, d) {
  const rows = [[]]; let cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === d) { rows[rows.length - 1].push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; rows[rows.length - 1].push(cur); cur = ''; rows.push([]); }
    else cur += ch; }
  rows[rows.length - 1].push(cur); if (rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop(); return rows;
}

/** Load the project's Apps Script files into a fresh context with fake services. Returns {ctx, ss, ui}. */
function loadProject(dir) {
  const ss = new FakeSpreadsheet();
  const ui = { alerts: [], alert() { ui.alerts.push([...arguments]); return 'OK'; }, ButtonSet: { OK_CANCEL: 'OK_CANCEL', OK: 'OK' }, Button: { OK: 'OK', CANCEL: 'CANCEL' }, createMenu() { const m = { addItem() { return m; }, addSeparator() { return m; }, addToUi() {} }; return m; }, showModalDialog() { ui.dialogs = (ui.dialogs || 0) + 1; } };
  const SpreadsheetApp = {
    getActive: () => ss, getUi: () => ui,
    newConditionalFormatRule: () => { const rule = { when: null, font: null, bold: false, ranges: [] }; const b = { whenNumberGreaterThan(n) { rule.when = ['>', n]; return b; }, whenNumberLessThanOrEqualTo(n) { rule.when = ['<=', n]; return b; }, setFontColor(c) { rule.font = c; return b; }, setBold(x) { rule.bold = x; return b; }, setRanges(r) { rule.ranges = r; return b; }, build() { return rule; } }; return b; },
    newDataValidation: () => { const rule = { kind: null, values: null, allowInvalid: true, help: '' }; const b = { requireValueInList(v, dd) { if (v.length > 500) throw new Error('A data validation rule can have at most 500 list items.'); rule.kind = 'list'; rule.values = v; return b; }, setAllowInvalid(x) { rule.allowInvalid = x; return b; }, setHelpText(t) { rule.help = t; return b; }, build() { return rule; } }; return b; }
  };
  const Utilities = { parseCsv, formatDate: (d, tz, fmt) => { const p = (n) => String(n).padStart(2, '0'); const s = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`; const t = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; if (fmt === 'yyyy-MM-dd') return s; if (fmt === 'HH:mm:ss') return `${t}:${p(d.getUTCSeconds())}`; if (fmt.indexOf('yyyy') >= 0) return `${s} ${t}`; return `${d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${d.getUTCDate()} ${t}`; } };
  const HtmlService = { createHtmlOutputFromFile: () => ({ setWidth() { return this; }, setHeight() { return this; } }), createHtmlOutput: () => ({ setWidth() { return this; }, setHeight() { return this; } }) };
  const ctx = vm.createContext({ SpreadsheetApp, Utilities, HtmlService, console });
  for (const f of ['Config.js', 'Metrics.js', 'Import.js', 'Main.js', 'Sheet.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  return { ctx, ss, ui, call: (name, ...args) => vm.runInContext(name, ctx)(...args) };
}

module.exports = { loadProject, FakeSheet, FakeSpreadsheet };
