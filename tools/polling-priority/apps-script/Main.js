/**
 * Main.js — the menu and the trigger.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Polling Priority')
    .addItem('Recompute priority', 'recomputePriority')
    .addItem('Build Line Reports tab', 'buildLineReports')
    .addSeparator()
    .addItem('Build sheet (first time)', 'buildSheet')
    .addItem('Check setup', 'checkSetup')
    .addSeparator()
    .addItem('Set up runner access', 'setupRunnerAccess')
    .addItem('Show runner access', 'showRunnerAccess')
    .addSeparator()
    .addItem('Install snapshot trigger', 'installTrigger')
    .addItem('Remove snapshot trigger', 'removeTrigger')
    .addSeparator()
    .addItem('Test line ingest (before election day only)', 'testLinesIngest')
    .addToUi();
}

/* ---------- menu actions ---------- */

function buildSheet() {
  var ui = SpreadsheetApp.getUi();
  buildReadme_();
  var fresh = buildSetup_();
  buildLocations_();
  buildAliases_();
  getOrCreate_(LOG_TAB);
  ui.alert(fresh
    ? 'Created README, Setup, locations, Aliases and log tabs with sample values.\n\nFill in Setup, paste your polling locations over the sample rows on the locations tab, then run Polling Priority → Recompute priority.'
    : 'Setup already exists, so it was left alone. Any missing tabs were added.');
}

function recomputePriority() {
  var ui = SpreadsheetApp.getUi();
  try {
    var cfg = readConfig();
    var result = buildPriority_(cfg, readLocations());
    var c = result.cutoffs.nvg;
    ui.alert('Ranked ' + result.rows.length + ' locations by net vote gain.\n\nNet vote gain tiers: 1 above ' + c[0] + ', 2 to ' + c[0] + ', 3 to ' + c[1] + ', 4 to ' + c[2] + ', 5 at or below ' + c[3] + (result.auto.nvg ? ' (automatic natural breaks; type cutoffs on Setup to fix them).' : ' (from Setup).'));
  } catch (err) {
    ui.alert('Could not compute:\n\n' + err.message);
  }
}

function buildLineReports() {
  var ui = SpreadsheetApp.getUi();
  try {
    var cfg = readConfig();
    var locations = readLocations();
    if (!SpreadsheetApp.getActive().getSheetByName(PRIORITY_TAB)) buildPriority_(cfg, locations);
    var n = buildLineReports_(cfg, locations);
    ui.alert('Line Reports tab built with ' + n + ' locations. It fills in once wait-time reports arrive.');
  } catch (err) {
    ui.alert('Could not build:\n\n' + err.message);
  }
}

/** Generate the token the runner uses, then show it with the web app URL. */
function setupRunnerAccess() {
  var ui = SpreadsheetApp.getUi();
  if (getToken_()) {
    var res = ui.alert('A token already exists. Make a new one? The runner on the laptop will need the new token.', ui.ButtonSet.YES_NO);
    if (res !== ui.Button.YES) return;
  }
  newToken_();
  showRunnerAccess();
}

function showRunnerAccess() {
  var ui = SpreadsheetApp.getUi();
  var token = getToken_();
  if (!token) { ui.alert('No token yet. Run Polling Priority → Set up runner access.'); return; }
  var url = ScriptApp.getService().getUrl();
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 Arial,sans-serif">' +
    '<p>On the laptop that will stay logged into LBJ, run <code>npm run setup</code> inside <code>runner/</code> and paste these two values when asked.</p>' +
    '<p><b>Web app URL</b><br><input style="width:100%" readonly value="' + (url || '') + '"></p>' +
    (url ? '' : '<p style="color:#b00">No web app deployment yet. In the Apps Script editor choose Deploy → New deployment → Web app (execute as <b>Me</b>, access <b>Anyone</b>), then come back here.</p>') +
    '<p><b>Token</b><br><input style="width:100%" readonly value="' + token + '"></p>' +
    '<p>Anyone with both values can write wait times into this sheet. Keep them with the runner only.</p>' +
    '</div>').setWidth(520).setHeight(300);
  ui.showModalDialog(html, 'Runner access');
}

function installTrigger() {
  removeTrigger(true);
  ScriptApp.newTrigger('snapshotTick').timeBased().everyMinutes(1).create();
  SpreadsheetApp.getUi().alert('Installed. Every minute the sheet checks whether a snapshot is due and refreshes the "Last scrape" age.');
}

function removeTrigger(quiet) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'snapshotTick') ScriptApp.deleteTrigger(t);
  });
  if (quiet !== true) SpreadsheetApp.getUi().alert('Snapshot trigger removed.');
}

/** Everything that has to be true before election day, in one alert. */
function checkSetup() {
  var ui = SpreadsheetApp.getUi();
  var ok = [], problems = [];
  var ss = SpreadsheetApp.getActive();
  try {
    var cfg = readConfig();
    if (cfg.electionDate) ok.push('election date ' + cfg.electionDate); else problems.push('Election date on Setup is blank, so no snapshot will run');
    if (cfg.snapshotTimes.length) ok.push(cfg.snapshotTimes.length + ' snapshot time(s)'); else problems.push('Snapshot times on Setup are empty or unreadable');
    if (ss.getSpreadsheetTimeZone() === cfg.timezone) ok.push('timezone ' + cfg.timezone); else problems.push('spreadsheet timezone is ' + ss.getSpreadsheetTimeZone() + ' but Setup says ' + cfg.timezone + ' — run Build Line Reports tab');
    var locations = readLocations();
    ok.push(locations.length + ' locations');
    var priority = readPriority_();
    var missing = locations.filter(function (l) { return !priority[l.key]; }).length;
    if (!Object.keys(priority).length) problems.push('no Priority tab — run Recompute priority');
    else if (missing) problems.push(missing + ' location(s) are not on the Priority tab — run Recompute priority');
    else ok.push('Priority tab current');
    var live = ss.getSheetByName(LIVE_TAB);
    if (!live) problems.push('no Line Reports tab — run Build Line Reports tab');
    else {
      try { checkLiveHeaders_(live, layout_(locations)); ok.push('Line Reports tab current'); }
      catch (e) { problems.push(e.message); }
    }
    var stale = ss.getSheets().map(function (s) { return s.getName(); }).filter(function (n) { return / Report( \(drill.*\))?$/.test(n); });
    var tz = ss.getSpreadsheetTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    if (stale.length && cfg.electionDate > today) problems.push('snapshot tabs from a drill exist: ' + stale.join(', ') + '. Delete them before election day');
  } catch (err) {
    problems.push(err.message);
  }
  if (ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'snapshotTick'; })) ok.push('snapshot trigger installed');
  else problems.push('no snapshot trigger — run Install snapshot trigger');
  if (getToken_()) ok.push('runner token set'); else problems.push('no runner token — run Set up runner access (skip if wait times come from somewhere else)');
  ui.alert((problems.length ? 'Fix these:\n• ' + problems.join('\n• ') + '\n\n' : 'Everything checks out.\n\n') + 'OK: ' + ok.join('; '));
}

/**
 * Pushes three fake reports through the real render, checks sort order,
 * preserved Notes and the accuracy reset, takes a snapshot and deletes it.
 * It OVERWRITES the live tab's report columns, so run it before election day only.
 */
function testLinesIngest() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var locations = readLocations();
    if (locations.length < 3) throw new Error('needs at least 3 locations');
    var L = layout_(locations);
    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    var now = new Date();
    var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    var clock = function (minAgo) { return Utilities.formatDate(new Date(now.getTime() - minAgo * 60000), tz, 'h:mm a'); };
    var push = function (firstTime) {
      return applyLinesPush_({ scrapedAt: now.toISOString(), reportDate: today, locationsSeen: 3, rows: [
        { name: locations[0].name, city: locations[0].city, wait: 'No Line', time: firstTime },
        { name: locations[1].name, city: locations[1].city, wait: '3+ Hours', time: clock(90) },
        { name: locations[2].name, city: locations[2].city, wait: '30 Minutes', time: clock(150) },
        { title: 'Nowhere Gym (Nowhere, Nothing)', wait: 'No Line', time: clock(1) }
      ] });
    };
    var out = push(clock(5));
    assert_(out.matched === 3 && out.unmatched.length === 1, 'three matched, one unmatched: got ' + JSON.stringify(out));
    var sheet = liveSheet_();
    var top = sheet.getRange(2, 1, 2, L.width).getValues();
    assert_(top[0][L.col['Reported Wait Time']] === '3+ Hours', 'longest wait sorts first');
    assert_(top[1][L.col['Reported Wait Time']] === '30 Minutes', '30 Minutes second');
    var rowOf = function (key) {
      var v = sheet.getRange(2, L.col['location_key'] + 1, locations.length, 1).getValues();
      for (var i = 0; i < v.length; i++) if (String(v[i][0]) === key) return i + 2;
      throw new Error('row for ' + key + ' not found');
    };
    sheet.getRange(rowOf(locations[0].key), L.col['Notes'] + 1).setValue('TEST note');
    sheet.getRange(rowOf(locations[0].key), L.col['Wait Time Accurate?'] + 1).setValue('Yes');
    sheet.getRange(rowOf(locations[1].key), L.col['Wait Time Accurate?'] + 1).setValue('No');
    push(clock(1));
    assert_(sheet.getRange(rowOf(locations[0].key), L.col['Notes'] + 1).getValue() === 'TEST note', 'Notes survive a re-render');
    assert_(sheet.getRange(rowOf(locations[0].key), L.col['Wait Time Accurate?'] + 1).getValue() === 'Unknown', 'a new report resets accuracy');
    assert_(sheet.getRange(rowOf(locations[1].key), L.col['Wait Time Accurate?'] + 1).getValue() === 'No', 'an unchanged report keeps accuracy');
    snapshot_('TEST Report', now, '');
    var snap = SpreadsheetApp.getActive().getSheetByName('TEST Report');
    assert_(snap.getRange(rowOf(locations[2].key), L.col['Time Reported'] + 1).getBackground() === AGE_COLORS.stale, 'a 150-minute-old report is frozen red');
    SpreadsheetApp.getActive().deleteSheet(snap);
    sheet.getRange(rowOf(locations[0].key), L.col['Notes'] + 1).setValue('');
    renderLive_(locations, {});
    ui.alert('All checks passed. The Line Reports tab was re-rendered with no reports.');
  } catch (err) {
    ui.alert('Test failed:\n\n' + err.message);
  } finally {
    lock.releaseLock();
  }
}

function assert_(cond, msg) {
  if (!cond) throw new Error(msg);
}
