/**
 * Main.js — the Report Sync menu.
 *
 * The everyday path is Upload export…: a person downloads a report from
 * Votebuilder's My Export Files and drops it in. The Advanced submenu wires
 * up the optional runner (runner/) that does the same thing on a schedule.
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Report Sync')
    .addItem('Upload export…', 'showUploadDialog')
    .addSeparator()
    .addItem('Build sheet (first time)', 'buildSheet')
    .addItem('Check Setup tab', 'checkSetup')
    .addSubMenu(ui.createMenu('Advanced: automatic runner')
      .addItem('Set up runner access', 'setupRunnerAccess')
      .addItem('Show runner access', 'showRunnerAccess'))
    .addToUi();
}

function showUploadDialog() {
  var html = HtmlService.createHtmlOutputFromFile('Upload').setWidth(480).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'Upload a Votebuilder export');
}

function buildSheet() {
  var ui = SpreadsheetApp.getUi();
  buildReadme_();
  var fresh = buildSetup_();
  getOrCreate_(LOG_TAB);
  ui.alert(fresh
    ? 'Created README, Setup and log tabs. List your reports on Setup (optional, it fills the tab dropdown), then use Report Sync → Upload export…'
    : 'Setup already exists, so it was left alone.');
}

function checkSetup() {
  var ui = SpreadsheetApp.getUi();
  try {
    var cfg = readConfig();
    var on = cfg.reports.filter(function (r) { return r.enabled; });
    ui.alert('Setup looks good.\n\n' + cfg.reports.length + ' report(s) listed' +
      (on.length !== cfg.reports.length ? ', ' + on.length + ' enabled for the runner' : '') + '.\n\n' +
      cfg.reports.map(function (r) { return '• ' + r.database + ': "' + r.name + '" → ' + r.tab; }).join('\n') +
      '\n\nRunner schedule: every ' + cfg.everyMin + ' min, ' + cfg.hours.start + ':00–' + cfg.hours.end + ':00 ' + cfg.timezone + '.');
  } catch (err) {
    ui.alert('Problem on the Setup tab:\n\n' + err.message);
  }
}

/* ---------- Advanced: the optional runner ---------- */

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
  if (!token) { ui.alert('No token yet. Run Report Sync → Advanced → Set up runner access.'); return; }
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 Arial,sans-serif">' +
    '<p>On the campaign laptop, open a terminal in the runner folder (<code>tools/report-sync/runner</code> inside the downloaded repository; docs/runner.md explains where to get it), run <code>npm run setup</code>, and paste these two values when asked.</p>' +
    '<p><b>Web app URL</b><br>Copy it from the Apps Script editor: <b>Extensions → Apps Script → Deploy → Manage deployments</b>, under <i>Web app</i> (it ends in <code>/exec</code>). No deployment there yet? <b>Deploy → New deployment → Web app</b>, execute as <b>Me</b>, access <b>Anyone</b>.</p>' +
    '<p><b>Sync token</b><br><input style="width:100%" readonly value="' + token + '"></p>' +
    '<p>Anyone with the URL and this token can write to this sheet. Keep them with the runner only.</p>' +
    '</div>').setWidth(520).setHeight(300);
  ui.showModalDialog(html, 'Runner access');
}
