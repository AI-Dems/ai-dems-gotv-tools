/**
 * Api.js — the web app the runner (or any wait-time source) talks to.
 * Deployed once from the Sheet (Deploy → New deployment → Web app, execute as
 * Me, access Anyone). Every request carries the token from script properties.
 * The contract is in docs/data-contract.md.
 *
 *   GET  ?token=…&action=ping     → { ok, sheet }
 *   GET  ?token=…&action=config   → { ok, config: { timezone, electionDate, everyMin, lbjElectionName } }
 *   POST { token, action: "lines", scrapedAt, reportDate, locationsSeen, rows: [...] }
 *   POST { token, action: "heartbeat", summary }
 */

var TOKEN_PROP = 'LINES_TOKEN';

function doGet(e) {
  return handle_(e && e.parameter || {});
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e && e.postData && e.postData.contents || '{}'); }
  catch (err) { return json_({ ok: false, error: 'body is not JSON' }); }
  return handle_(body);
}

function handle_(req) {
  var expected = getToken_();
  if (!expected) return json_({ ok: false, error: 'no token set; run Polling Priority → Set up runner access' });
  if (String(req.token || '') !== expected) return json_({ ok: false, error: 'bad token' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'busy', retryable: true });
  try {
    switch (req.action) {
      case 'ping':
        return json_({ ok: true, sheet: SpreadsheetApp.getActive().getName() });
      case 'config': {
        var cfg = readConfig();
        return json_({ ok: true, config: { timezone: cfg.timezone, electionDate: cfg.electionDate, everyMin: cfg.everyMin, lbjElectionName: cfg.lbjElectionName } });
      }
      case 'lines': {
        var out = applyLinesPush_(req);
        out.snapshots = takeDueSnapshots_(new Date(req.scrapedAt), false);
        setStatus_({ 'Runner last seen': new Date() });
        return json_(out);
      }
      case 'heartbeat':
        setStatus_({ 'Runner last seen': new Date(), 'Runner says': String(req.summary || '') });
        return json_({ ok: true });
      default:
        return json_({ ok: false, error: 'unknown action "' + req.action + '"' });
    }
  } catch (err) {
    log_('error', (req.action || '?') + ': ' + err.message);
    return json_({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty(TOKEN_PROP);
}

/** A fresh random token, saved to script properties. */
function newToken_() {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROP, token);
  return token;
}
