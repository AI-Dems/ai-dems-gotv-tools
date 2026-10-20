/**
 * Job.js — the resumable vetting run and the FEC cache.
 *
 * Apps Script stops any run at 6 minutes and the FEC allows about one request
 * every 3.7 seconds, so a list of 200 people takes several runs. Each run
 * looks up as many people as fit in BUDGET_MS, saves what it found to the
 * hidden fec_cache tab, rebuilds the Vetting tab (people not yet looked up
 * show as Pending), and schedules itself again a minute later until done.
 *
 * The cache is keyed by the exact query (name + state), so editing someone's
 * zip or street re-narrows their cached records without a new request.
 */

var CACHE_TAB = 'fec_cache', VETTING_TAB = 'Vetting';
var BUDGET_MS = 4.5 * 60 * 1000;
var PERSON_RESERVE_MS = MAX_PAGES * 4000 + 60000;   // worst case for one person: 5 pages plus one rate-limit retry
var CELL_CHARS = 45000;                              // a cell holds 50,000 characters; records are split across cells

/** Menu: start (or continue) a run now. */
function vetObservers() {
  var ui = SpreadsheetApp.getUi();
  if (!getFecKey_()) { ui.alert('No FEC API key yet. Run Observer Vetting → Set FEC API key first.'); return; }
  try {
    var out = runBatch_();
    ui.alert(out.remaining
      ? 'Looked up ' + out.done + ' of ' + out.total + ' people so far. The rest continue automatically, about ' + Math.ceil(out.remaining * 8 / 60) + ' more minutes.\n\nWatch Setup → Status. Rows still waiting say Pending on the Vetting tab.'
      : 'Done. ' + summaryText_(out.counts) + '\n\nSee the Vetting tab.');
  } catch (err) {
    ui.alert('Could not run:\n\n' + err.message);
  }
}

/** Trigger: continue a run. */
function vetTick() {
  clearTicks_();
  try { runBatch_(); }
  catch (err) { log_('error', 'continue: ' + err.message); setStatus_({ 'Vetting': 'stopped: ' + err.message }); }
}

function runBatch_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('A run is already in progress. Wait for it to finish (Setup → Status).');
  try {
    var start = Date.now();
    var cfg = readConfig(), rules = readRules(), observers = readObservers(), key = getFecKey_();
    var cache = readCache_();
    var todo = {}, needed = {};
    observers.forEach(function (o) {
      if (pathFor(o, cfg) === PATH.VF) return;
      needed[fecKey(o)] = true;
      if (!cache.hasOwnProperty(fecKey(o))) todo[fecKey(o)] = o;
    });
    var keys = Object.keys(todo), total = Object.keys(needed).length, fetched = 0, failures = 0;

    for (var i = 0; i < keys.length; i++) {
      if (Date.now() - start > BUDGET_MS - PERSON_RESERVE_MS) break;
      var obs = todo[keys[i]];
      try {
        var records = fetchDonations_(key, obs, cfg);
        appendCache_(keys[i], records);
        cache[keys[i]] = records;
        fetched++; failures = 0;
      } catch (err) {
        log_('error', 'FEC lookup for ' + obs.first + ' ' + obs.last + ': ' + err.message);
        if (++failures >= 3) throw new Error('Three FEC lookups in a row failed; stopping. Last error: ' + err.message);
      }
    }

    var built = writeVetting_(observers, cache, readPrior(), cfg, rules);
    var remaining = keys.length - fetched;
    var done = total - remaining;
    if (remaining) {
      ScriptApp.newTrigger('vetTick').timeBased().after(60 * 1000).create();
      setStatus_({ 'Vetting': 'running', 'FEC lookups': done + ' of ' + total + ' done; continues automatically', 'Last run': new Date() });
    } else {
      setStatus_({ 'Vetting': 'done', 'FEC lookups': total + ' cached', 'Last run': new Date(), 'Results': summaryText_(built.counts) });
    }
    log_('ok', 'Run: ' + fetched + ' FEC lookups, ' + remaining + ' remaining. ' + summaryText_(built.counts));
    return { done: done, total: total, remaining: remaining, counts: built.counts };
  } finally {
    lock.releaseLock();
  }
}

function summaryText_(counts) {
  return ['Pass', 'Review', 'Flag', 'Pending'].filter(function (s) { return counts[s]; }).map(function (s) { return counts[s] + ' ' + s; }).join(', ') || 'no rows';
}

function clearTicks_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'vetTick') ScriptApp.deleteTrigger(t); });
}

/* ---------- cache tab ---------- */

/** { fecKey: records[] } from the hidden cache tab. */
function readCache_() {
  var sheet = cacheSheet_(), out = {};
  if (sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach(function (row) {
    if (!row[0]) return;
    try { out[row[0]] = JSON.parse(row.slice(2).join('')); } catch (e) { /* a half-written row: refetch */ }
  });
  return out;
}

function appendCache_(key, records) {
  var json = JSON.stringify(records), cells = [];
  for (var i = 0; i < json.length; i += CELL_CHARS) cells.push(json.slice(i, i + CELL_CHARS));
  var sheet = cacheSheet_();
  var row = [key, new Date()].concat(cells);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function cacheSheet_() {
  var ss = SpreadsheetApp.getActive(), sheet = ss.getSheetByName(CACHE_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(CACHE_TAB);
    sheet.getRange(1, 1, 1, 3).setValues([['fec_key', 'fetched_at', 'records (JSON, may continue in further columns)']]).setFontWeight('bold');
    sheet.hideSheet();
  }
  return sheet;
}

/** Menu: forget every FEC lookup so the next run fetches fresh. */
function clearFecCache() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Delete all cached FEC lookups? The next run will fetch everyone again (about 8 seconds per person).', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var sheet = SpreadsheetApp.getActive().getSheetByName(CACHE_TAB);
  if (sheet && sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  setStatus_({ 'FEC lookups': '0 cached' });
  ui.alert('Cache cleared.');
}
