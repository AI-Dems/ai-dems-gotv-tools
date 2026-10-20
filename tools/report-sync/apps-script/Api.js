/**
 * Api.js — the web app the runner talks to. Deployed once from the Sheet
 * (Deploy → New deployment → Web app, execute as Me, access Anyone). Every
 * request carries the sync token from script properties; nothing else is
 * accepted. The contract is documented in docs/data-contract.md.
 *
 *   GET  ?token=…&action=config            → {ok, config}
 *   GET  ?token=…&action=ping              → {ok, sheet}
 *   POST {token, action:"replace", tab, rows, report, database, file}
 *   POST {token, action:"log", records:[…]}
 *   POST {token, action:"heartbeat", summary}
 */

var TOKEN_PROP = 'SYNC_TOKEN';

function doGet(e) {
  return handle_(e.parameter || {});
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData && e.postData.contents || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'body is not JSON' });
  }
  return handle_(body);
}

function handle_(req) {
  var expected = PropertiesService.getScriptProperties().getProperty(TOKEN_PROP);
  if (!expected) return json_({ ok: false, error: 'no sync token set; run Report Sync → Set up runner access' });
  if (String(req.token || '') !== expected) return json_({ ok: false, error: 'bad token' });

  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    switch (req.action) {
      case 'ping':
        return json_({ ok: true, sheet: SpreadsheetApp.getActive().getName() });
      case 'config':
        return json_({ ok: true, config: readConfig() });
      case 'replace': {
        if (!req.tab || !Array.isArray(req.rows)) return json_({ ok: false, error: 'replace needs tab and rows' });
        if (RESERVED_TABS.indexOf(req.tab) >= 0) return json_({ ok: false, error: '"' + req.tab + '" is reserved' });
        var n = replaceTab_(req.tab, req.rows);
        log_([{ report: req.report, database: req.database, tab: req.tab, file: req.file, rows: req.rows.length, status: 'OK' }]);
        setStatus_('Runner last seen', new Date());
        return json_({ ok: true, rows: n });
      }
      case 'log':
        log_(Array.isArray(req.records) ? req.records : []);
        return json_({ ok: true });
      case 'heartbeat':
        setStatus_('Runner last seen', new Date());
        if (req.summary) {
          setStatus_('Last pass', new Date());
          setStatus_('Last pass result', String(req.summary));
        }
        return json_({ ok: true });
      default:
        return json_({ ok: false, error: 'unknown action "' + req.action + '"' });
    }
  } catch (err) {
    return json_({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- token ---------- */

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty(TOKEN_PROP);
}

/** A fresh random token, saved to script properties. */
function newToken_() {
  var bytes = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROP, bytes);
  return bytes;
}
