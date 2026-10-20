/**
 * Lines.js — the Line Reports tab: one row per polling location, re-rendered
 * from the locations + Priority tabs on every push of wait-time reports,
 * sorted longest line first, with timed snapshot tabs on election day.
 *
 * A push (Api.js → applyLinesPush_) carries every location the reporting
 * system shows. Rows are rebuilt from scratch; only the three human columns
 * (Wait Time Accurate?, Volunteers Deployed, Notes) are carried over.
 *
 * Originally the NH 2026 coordinated campaign's line tracker, which read a
 * generated roster. This version reads the locations tab, so adding a polling
 * place is a row on a sheet, not a code change.
 */

var LIVE_TAB = 'Line Reports';
var LAST_SCRAPE_PROP = 'LINES_LAST_SCRAPE';

var LEFT = ['Rank', 'Tier', 'Net Vote Gain', 'Likely Voters', 'Location', 'City', 'Precincts'];
var REPORT = ['Date Reported', 'Time Reported', 'Reported Wait Time'];
var HUMAN = ['Wait Time Accurate?', 'Volunteers Deployed', 'Notes'];
var HIDDEN = ['location_key', 'Reported as', 'report_key'];

var AGE_COLORS = { fresh: '#b7e1cd', aging: '#fce8b2', stale: '#f4c7c3' };
var SCRAPE_COLORS = { fresh: '#b7e1cd', stale: '#e06666' };
var SNAPSHOT_WINDOW_MIN = 60;   // a snapshot time further past than this is skipped and recorded as missed
var SNAPSHOT_FALLBACK_MIN = 10; // snapshot from the trigger when no push arrived this long after the time
var STALE_SCRAPE_MIN = 12;

/** Column layout for the current locations tab. Indexes are 0-based. */
function layout_(locations) {
  var headers = LEFT.concat(locations.extraHeaders, REPORT, HUMAN, HIDDEN);
  var col = {};
  headers.forEach(function (h, i) { col[h] = i; });
  return {
    headers: headers, width: headers.length, col: col,
    extras: locations.extraHeaders,
    firstHuman: col['Wait Time Accurate?'] + 1,  // 1-based
    firstHidden: col['location_key'] + 1,
    scrapeCol: headers.length + 1
  };
}

/* ---------- a push ---------- */

/**
 * body: { scrapedAt, reportDate, locationsSeen, rows: [{ title | name+city, sourceId, wait, time }] }
 * Returns { ok, rows, matched, unmatched, unknownWaits }.
 */
function applyLinesPush_(body) {
  var scrapedAt = new Date(body.scrapedAt);
  if (isNaN(scrapedAt.getTime())) throw new Error('scrapedAt is not a date');
  var reportDate = String(body.reportDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error('reportDate must be yyyy-mm-dd');
  if (!Array.isArray(body.rows)) throw new Error('rows must be an array');

  var locations = readLocations();
  var match = buildMatcher(locations, readAliases(locations));
  var reports = [], unmatched = [], unknownWaits = [];
  body.rows.forEach(function (r) {
    var key = match(r);
    var wait = String(r.wait || '').trim();
    if (wait && !KNOWN_WAITS.some(function (k) { return k.toLowerCase() === wait.toLowerCase(); }) && unknownWaits.indexOf(wait) < 0) unknownWaits.push(wait);
    if (!key) { unmatched.push(r.title || (r.name + ' (' + r.city + ')')); return; }
    reports.push({ key: key, wait: wait, time: r.time, source: r.title || (r.name + ' (' + r.city + ')') });
  });
  var latest = latestByKey(reports, reportDate);
  var n = renderLive_(locations, latest);
  PropertiesService.getScriptProperties().setProperty(LAST_SCRAPE_PROP, scrapedAt.toISOString());
  refreshScrapeAge_(locations);
  writeLineStatus_(scrapedAt, reportDate, body.locationsSeen, Object.keys(latest).length, unmatched);
  return { ok: true, rows: n, matched: Object.keys(latest).length, unmatched: unmatched, unknownWaits: unknownWaits };
}

/**
 * Re-render every row, sorted, keeping the human columns. Those are read
 * again just before the write and the rows rebuilt if anyone edited in
 * between, so the window for losing an edit is a few milliseconds.
 */
function renderLive_(locations, latest) {
  var L = layout_(locations);
  var sheet = liveSheet_();
  checkLiveHeaders_(sheet, L);
  var need = locations.length + 1;
  if (sheet.getMaxRows() < need) sheet.insertRowsAfter(sheet.getMaxRows(), need - sheet.getMaxRows());
  var priority = readPriority_();
  var prev = previousRows_(sheet, L);
  var rows = buildLiveRows_(locations, priority, latest, prev, L);
  var again = previousRows_(sheet, L);
  if (JSON.stringify(again) !== JSON.stringify(prev)) rows = buildLiveRows_(locations, priority, latest, again, L);
  sheet.getRange(2, 1, rows.length, L.width).setValues(rows);
  if (sheet.getLastRow() > need) sheet.getRange(need + 1, 1, sheet.getLastRow() - need, L.width).clearContent();
  return rows.length;
}

function checkLiveHeaders_(sheet, L) {
  var head = sheet.getRange(1, 1, 1, L.width).getValues()[0].join('|');
  if (head !== L.headers.join('|')) throw new Error('The Line Reports tab\'s columns are out of date (the locations tab changed). Run Polling Priority → Build Line Reports tab.');
}

function buildLiveRows_(locations, priority, latest, prev, L) {
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var objs = locations.map(function (loc) {
    var p = priority[loc.key] || {}, rep = latest[loc.key] || null, old = prev[loc.key] || {};
    var key = rep ? rep.reportedAt + '|' + rep.wait : '';
    var row = new Array(L.width);
    row[L.col['Rank']] = p.rank === undefined ? '' : p.rank;
    row[L.col['Tier']] = p.tier === undefined ? '' : p.tier;
    row[L.col['Net Vote Gain']] = p.nvg === undefined ? '' : p.nvg;
    row[L.col['Likely Voters']] = p.likelyVoters === undefined ? '' : p.likelyVoters;
    row[L.col['Location']] = loc.name;
    row[L.col['City']] = loc.city;
    row[L.col['Precincts']] = loc.precincts;
    L.extras.forEach(function (h) { row[L.col[h]] = loc.extras[h]; });
    row[L.col['Date Reported']] = rep ? Utilities.parseDate(rep.reportedAt.slice(0, 10), tz, 'yyyy-MM-dd') : '';
    row[L.col['Time Reported']] = rep ? (rep.h * 60 + rep.m) / 1440 : '';
    row[L.col['Reported Wait Time']] = rep ? rep.wait : '';
    // a new report makes the old accuracy judgment meaningless
    row[L.col['Wait Time Accurate?']] = old.key === key && old.accurate ? old.accurate : 'Unknown';
    row[L.col['Volunteers Deployed']] = old.deployed === true;
    row[L.col['Notes']] = old.notes === undefined ? '' : old.notes;
    row[L.col['location_key']] = loc.key;
    row[L.col['Reported as']] = rep ? rep.source : '';
    row[L.col['report_key']] = key;
    return { row: row, wait: rep ? rep.wait : '', rank: row[L.col['Rank']], name: loc.name };
  });
  objs.sort(compareLive);
  return objs.map(function (o) { return o.row; });
}

/** Human columns by location key, plus the report key the row was rendered from. */
function previousRows_(sheet, L) {
  var last = sheet.getLastRow(), out = {};
  if (last < 2) return out;
  sheet.getRange(2, 1, last - 1, L.width).getValues().forEach(function (v) {
    var key = String(v[L.col['location_key']] || '');
    if (key) out[key] = { accurate: v[L.col['Wait Time Accurate?']], deployed: v[L.col['Volunteers Deployed']], notes: v[L.col['Notes']], key: String(v[L.col['report_key']] || '') };
  });
  return out;
}

/** "Last scrape" cell right of the data, colored by age. */
function refreshScrapeAge_(locations) {
  var L = layout_(locations || readLocations());
  var sheet = liveSheet_();
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var last = PropertiesService.getScriptProperties().getProperty(LAST_SCRAPE_PROP);
  var cell = sheet.getRange(1, L.scrapeCol);
  var at = last ? new Date(last) : null;
  if (!at || isNaN(at.getTime())) {
    cell.setValue('Last scrape: never').setBackground(SCRAPE_COLORS.stale).setFontColor('#ffffff').setFontWeight('bold');
    return;
  }
  var ageMin = Math.max(0, Math.floor((Date.now() - at.getTime()) / 60000));
  var stale = ageMin > STALE_SCRAPE_MIN;
  cell.setValue('Last scrape ' + Utilities.formatDate(at, tz, 'h:mm:ss a') + ' (' + ageMin + ' min ago)')
    .setBackground(stale ? SCRAPE_COLORS.stale : SCRAPE_COLORS.fresh).setFontColor(stale ? '#ffffff' : '#000000').setFontWeight('bold');
}

function writeLineStatus_(scrapedAt, reportDate, seen, matched, unmatched) {
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var pairs = {
    'Last scrape': Utilities.formatDate(scrapedAt, tz, 'yyyy-MM-dd h:mm:ss a'),
    'Report date': reportDate,
    'Locations reported': Number(seen) || 0,
    'Locations matched': matched,
    'Unmatched locations': unmatched.length ? unmatched.length + ' — add to Aliases: ' + unmatched.slice(0, 20).join(' | ') : 0
  };
  setStatus_(pairs);
}

/* ---------- snapshots ---------- */

/**
 * Takes each configured snapshot at most once, on the election date only.
 * From a push (fallback=false), time T is due when the scrape started at or
 * after T. From the trigger (fallback=true), T is due once
 * SNAPSHOT_FALLBACK_MIN has passed with no push. A time more than
 * SNAPSHOT_WINDOW_MIN past with no tab is recorded as missed.
 *
 * A "<label> Report" tab from another date (a drill) is renamed out of the
 * way so it cannot block the real snapshot.
 */
function takeDueSnapshots_(scrapedAt, fallback) {
  var cfg = readConfig();
  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  if (!cfg.electionDate || cfg.electionDate !== today) return [];
  var taken = [], missed = [];
  cfg.snapshotTimes.forEach(function (t) {
    var name = t.label + ' Report';
    var at = Utilities.parseDate(today + ' ' + pad2(t.h) + ':' + pad2(t.m), tz, 'yyyy-MM-dd HH:mm');
    var sinceMin = (now.getTime() - at.getTime()) / 60000;
    var existing = ss.getSheetByName(name);
    if (existing) {
      var stamp = snapshotDate_(existing);
      if (stamp ? stamp === today : sinceMin >= 0) return;
      var moved = uniqueName_(ss, name + ' (drill ' + (stamp || 'undated') + ')');
      existing.setName(moved);
      log_('info', 'renamed stale tab "' + name + '" to "' + moved + '" so the ' + t.text + ' snapshot can run');
    }
    if (sinceMin < 0) return;
    if (sinceMin > SNAPSHOT_WINDOW_MIN) { missed.push(t.text); return; }
    if (!fallback && scrapedAt.getTime() >= at.getTime()) {
      snapshot_(name, now, '');
      taken.push(name);
    } else if (fallback && sinceMin >= SNAPSHOT_FALLBACK_MIN) {
      var last = PropertiesService.getScriptProperties().getProperty(LAST_SCRAPE_PROP);
      var since = last ? Utilities.formatDate(new Date(last), tz, 'h:mm a') : 'never';
      snapshot_(name, now, 'No scrape arrived after ' + t.text + '. Data is from the last scrape (' + since + ').');
      taken.push(name);
    }
  });
  if (missed.length) setStatus_({ 'Missed snapshots': missed.join(', ') });
  if (taken.length) log_('ok', 'snapshot taken: ' + taken.join(', '));
  return taken;
}

function snapshotDate_(sheet) {
  var m = sheet.getRange('A1').getNote().match(/Snapshot taken (\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function uniqueName_(ss, base) {
  var name = base;
  for (var i = 2; ss.getSheetByName(name); i++) name = base + ' ' + i;
  return name;
}

/** Copy the live tab and freeze its Time Reported colors as of `asOf`. */
function snapshot_(name, asOf, staleNote) {
  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone();
  var L = layout_(readLocations());
  var live = liveSheet_();
  var copy = live.copyTo(ss).setName(name);
  copy.getRange(1, L.scrapeCol).clear();

  var n = copy.getLastRow() - 1;
  copy.clearConditionalFormatRules();
  if (n > 0) {
    var keys = copy.getRange(2, L.col['report_key'] + 1, n, 1).getValues();
    var colors = keys.map(function (k) {
      var at = String(k[0] || '').split('|')[0];
      if (!at) return [null];
      var ageMin = (asOf.getTime() - Utilities.parseDate(at, tz, 'yyyy-MM-dd HH:mm').getTime()) / 60000;
      return [ageMin < 60 ? AGE_COLORS.fresh : ageMin < 120 ? AGE_COLORS.aging : AGE_COLORS.stale];
    });
    copy.getRange(2, L.col['Time Reported'] + 1, n, 1).setBackgrounds(colors);
  }
  copy.hideColumns(L.firstHidden, HIDDEN.length);
  copy.showColumns(L.firstHuman, HUMAN.length);

  copy.getRange('A1').setNote((staleNote ? staleNote + '\n' : '') + 'Snapshot taken ' + Utilities.formatDate(asOf, tz, 'yyyy-MM-dd h:mm a') + '.');
  if (staleNote) copy.setTabColor(AGE_COLORS.stale);
  var protection = copy.protect().setDescription('Snapshot ' + name).setWarningOnly(true);
  if (n > 0) protection.setUnprotectedRanges([copy.getRange(2, L.firstHuman, n, HUMAN.length)]);

  // keep snapshots in time order, right after the live tab
  var pos = live.getIndex();
  ss.getSheets().forEach(function (s) {
    if (s.getSheetId() !== copy.getSheetId() && / Report$/.test(s.getName())) pos = Math.max(pos, s.getIndex());
  });
  ss.setActiveSheet(copy);
  ss.moveActiveSheet(pos + 1);
  ss.setActiveSheet(live);
}

/** Trigger target, every minute. Also keeps the "Last scrape" color current. */
function snapshotTick() {
  try { refreshScrapeAge_(); } catch (err) { console.error('refreshScrapeAge_: ' + err); }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try { takeDueSnapshots_(null, true); }
  catch (err) { console.error('snapshotTick: ' + err); }
  finally { lock.releaseLock(); }
}

/* ---------- building the tab ---------- */

/** Idempotent. Lays out the live tab for the current locations tab and renders it with no reports. */
function buildLineReports_(cfg, locations) {
  var ss = SpreadsheetApp.getActive();
  var L = layout_(locations);
  var sheet = getOrCreate_(LIVE_TAB);
  var need = locations.length + 1;
  var prev = sheet.getLastRow() > 1 ? previousRows_(sheet, readOldLayout_(sheet) || L) : {};
  sheet.clear();
  sheet.clearConditionalFormatRules();
  if (sheet.getMaxColumns() < L.scrapeCol) sheet.insertColumnsAfter(sheet.getMaxColumns(), L.scrapeCol - sheet.getMaxColumns());
  if (sheet.getMaxRows() > need) sheet.deleteRows(need + 1, sheet.getMaxRows() - need);
  if (sheet.getMaxRows() < need) sheet.insertRowsAfter(sheet.getMaxRows(), need - sheet.getMaxRows());
  for (var c = 1; c <= L.width; c++) sheet.showColumns(c);
  sheet.getRange(1, 1, 1, L.width).setValues([L.headers]).setFontWeight('bold').setBackground(COLORS.header).setFontColor(COLORS.headerText).setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  sheet.setColumnWidth(L.col['Location'] + 1, 220);
  sheet.setColumnWidth(L.col['Precincts'] + 1, 220);
  sheet.setColumnWidth(L.col['Notes'] + 1, 260);
  sheet.setColumnWidth(L.scrapeCol, 250);
  var n = locations.length;
  sheet.getRange(2, L.col['Date Reported'] + 1, n, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, L.col['Time Reported'] + 1, n, 1).setNumberFormat('h:mm AM/PM');
  sheet.getRange(2, L.col['Net Vote Gain'] + 1, n, 2).setNumberFormat('#,##0');
  sheet.getRange(2, L.col['Wait Time Accurate?'] + 1, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Unknown', 'Yes', 'No'], true).build());
  sheet.getRange(2, L.col['Volunteers Deployed'] + 1, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  setAgeColors_(sheet, L, n);
  var tierRange = sheet.getRange(2, L.col['Tier'] + 1, n, 1);
  sheet.setConditionalFormatRules(sheet.getConditionalFormatRules().concat([1, 2, 3, 4, 5].map(function (t) {
    return SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(t).setBackground(TIER_COLORS[t]).setRanges([tierRange]).build();
  })));
  sheet.getRange(1, 1).setNote('Sorted longest reported wait first, then by priority rank. Re-rendered on every push from the runner. Wait Time Accurate?, Volunteers Deployed and Notes are filled in on the snapshot tabs.');
  sheet.hideColumns(L.firstHidden, HIDDEN.length);
  sheet.hideColumns(L.firstHuman, HUMAN.length);
  ss.setSpreadsheetTimeZone(cfg.timezone);
  ss.setRecalculationInterval(SpreadsheetApp.RecalculationInterval.MINUTE);
  // render with no reports, keeping any notes typed before the rebuild
  var rows = buildLiveRows_(locations, readPriority_(), {}, prev, L);
  sheet.getRange(2, 1, rows.length, L.width).setValues(rows);
  refreshScrapeAge_(locations);
  return rows.length;
}

/** The layout a previously built live tab used, from its header row, so a rebuild can keep notes. */
function readOldLayout_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  if (headers.indexOf('location_key') < 0) return null;
  var col = {};
  headers.forEach(function (h, i) { col[h] = i; });
  return { headers: headers, width: headers.length, col: col };
}

/** Time Reported: green under 1h old, yellow 1–2h, red over 2h. NOW() moves every minute because the recalculation interval is set. */
function setAgeColors_(sheet, L, n) {
  var time = colLetter_(L.col['Time Reported'] + 1), date = colLetter_(L.col['Date Reported'] + 1);
  var range = sheet.getRange(2, L.col['Time Reported'] + 1, n, 1);
  var at = '($' + date + '2+$' + time + '2)', has = '$' + time + '2<>""';
  var rule = function (formula, color) {
    return SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula).setBackground(color).setRanges([range]).build();
  };
  sheet.setConditionalFormatRules([
    rule('=AND(' + has + ',' + at + '>=NOW()-1/24)', AGE_COLORS.fresh),
    rule('=AND(' + has + ',' + at + '<NOW()-1/24,' + at + '>=NOW()-2/24)', AGE_COLORS.aging),
    rule('=AND(' + has + ',' + at + '<NOW()-2/24)', AGE_COLORS.stale)
  ]);
}

function liveSheet_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(LIVE_TAB);
  if (!sheet) throw new Error('No "' + LIVE_TAB + '" tab. Run Polling Priority → Build Line Reports tab.');
  return sheet;
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}
