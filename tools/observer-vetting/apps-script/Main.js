/**
 * Main.js — the menu.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Observer Vetting')
    .addItem('Vet observers', 'vetObservers')
    .addItem('Make shareable copy (redacted)', 'makeShareableCopy')
    .addSeparator()
    .addItem('Build sheet (first time)', 'buildSheet')
    .addItem('Set FEC API key', 'setFecKey')
    .addItem('Check setup', 'checkSetup')
    .addSeparator()
    .addItem('Stop run', 'stopRun')
    .addItem('Clear FEC cache', 'clearFecCache')
    .addToUi();
}

function buildSheet() {
  var ui = SpreadsheetApp.getUi();
  buildReadme_();
  var fresh = buildSetup_();
  buildObservers_();
  buildNicknames_();
  buildCommittees_();
  buildPrior_();
  getOrCreate_(LOG_TAB);
  ui.alert(fresh
    ? 'Created README, Setup, observers, Nicknames, Committees, prior_observers and log tabs with sample values.\n\nSet Home state on Setup, run Observer Vetting → Set FEC API key, paste your observers over the sample rows, then Observer Vetting → Vet observers.'
    : 'Setup already exists, so it was left alone. Any missing tabs were added.');
}

function stopRun() {
  clearTicks_();
  setStatus_({ 'Vetting': 'stopped by hand; run Vet observers to continue' });
  SpreadsheetApp.getUi().alert('Stopped. Lookups already done are kept; Vet observers picks up where it left off.');
}

/** Everything that has to be true before a run, in one alert. */
function checkSetup() {
  var ui = SpreadsheetApp.getUi();
  var ok = [], problems = [];
  try {
    var cfg = readConfig();
    ok.push('home state ' + cfg.homeState + ', threshold ' + cfg.threshold + ', cycles ' + cfg.cycles[0] + '–' + cfg.cycles[cfg.cycles.length - 1]);
    var observers = readObservers();
    var paths = {};
    observers.forEach(function (o) { var p = pathFor(o, cfg); paths[p] = (paths[p] || 0) + 1; });
    ok.push(observers.length + ' observers (' + Object.keys(paths).map(function (p) { return paths[p] + ' ' + p.toLowerCase(); }).join(', ') + ')');
    var noAddr = paths[PATH.NONE] || 0;
    if (noAddr) problems.push(noAddr + ' observer(s) have no state, so they can only be Review. Add state and zip if you have them');
    var vf = observers.filter(function (o) { return o.inVoterFile; });
    var noParty = vf.filter(function (o) { return !o.vfParty && o.supportScore === ''; }).length;
    if (noParty) problems.push(noParty + ' voter-file row(s) have neither a party nor a support score and will Flag');
    var cached = readCache_(), missing = 0;
    observers.forEach(function (o) { if (pathFor(o, cfg) !== PATH.VF && !cached.hasOwnProperty(fecKey(o))) missing++; });
    ok.push(missing ? missing + ' FEC lookups still to do (about ' + Math.ceil(missing * 8 / 60) + ' min)' : 'FEC lookups all cached');
    var rules = readRules();
    ok.push(Object.keys(rules.nick).length + ' nicknames, ' + rules.keywords.length + ' committee keywords');
  } catch (err) {
    problems.push(err.message);
  }
  if (getFecKey_()) ok.push('FEC API key set'); else problems.push('no FEC API key — run Set FEC API key');
  if (ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'vetTick'; })) ok.push('a run is in progress');
  ui.alert((problems.length ? 'Fix these:\n• ' + problems.join('\n• ') + '\n\n' : 'Everything checks out.\n\n') + 'OK: ' + ok.join('; '));
}
