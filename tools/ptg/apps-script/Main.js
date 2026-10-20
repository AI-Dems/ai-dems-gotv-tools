/**
 * Main.js — menu and the run.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('PTG')
    .addItem('Import VAN export…', 'showImportDialog')
    .addItem('Run now', 'runNow')
    .addSeparator()
    .addItem('Build sheet (first time)', 'buildSheet')
    .addItem('Build PTG tab (keeps goals)', 'buildPtgTab')
    .addItem('Reset Setup and README to sample values…', 'resetSetup')
    .addSeparator()
    .addItem('Show imported columns', 'showImportedColumns')
    .addItem('Check dashboard against raw', 'checkDashboard')
    .addItem('Clear imported VAN data', 'clearImports')
    .addToUi();
}

/** The whole pipeline: import tabs → hits → counts → raw tab. Returns a summary string. */
function run_() {
  var started = new Date();
  var cfg = readConfig();
  var today = Utilities.formatDate(started, cfg.timezone, 'yyyy-MM-dd');
  var hits = [], notes = [];

  var wantsSurvey = cfg.metrics.some(isSurveyMetric);
  var wantsShifts = cfg.metrics.some(isShiftMetric);
  var groups = cfg.groups.concat([cfg.unassigned]);   // the Unassigned row is counted like a group
  cfg.warnings.forEach(function (w) { notes.push('WARNING: ' + w); });
  if (!ptgMatchesConfig_(cfg)) { buildPtg_(cfg); notes.push('Dashboard rebuilt to match Setup (goals and imports kept).'); }
  if (cfg.externalRaw) {
    // A warehouse writes raw. Don't touch it; just say whether the dashboard can read it.
    var ext = readRawRows_();
    notes.push('Raw tab is fed from outside: nothing was recounted. raw holds ' + ext.length + ' rows.');
    notes.push(dashboardCheck_(ext));
    var summaryExt = notes.join('\n\n');
    log_('ok', summaryExt);
    return summaryExt;
  }
  var externals = cfg.metrics.filter(isExternalMetric).map(function (m) { return '"' + m.label + '"'; });
  if (externals.length) notes.push('Column' + (externals.length === 1 ? '' : 's') + ' ' + externals.join(', ') + ' are fed from outside and were not recounted; rows already in raw for them are kept.');

  if (wantsSurvey) {
    var survey = readImportTab_(SURVEY_TAB);
    if (!survey) {
      var surveyCols = cfg.metrics.filter(function (m) { return !isShiftMetric(m); }).map(function (m) { return '"' + m.label + '"'; });
      throw new Error('Setup has survey column' + (surveyCols.length === 1 ? '' : 's') + ' (' + surveyCols.join(', ') + ') but no survey data is loaded. Either import or paste VAN\'s Survey Response Report (PTG → Import VAN export…), or, to track shifts only, clear those rows on Setup and run PTG → Build PTG tab again.');
    }
    var vanIdCol = resolveColumn(survey.header, cfg.columns.surveyVanId, COLUMN_CANDIDATES.surveyVanId);
    var sc = surveyColumns_(survey.header, cfg.columns);
    var s;
    if (sc.question) {
      // Long format: VAN's Survey Response Report, one row per response.
      if (!vanIdCol) throw new Error('The survey export has no VANID column (tried ' + COLUMN_CANDIDATES.surveyVanId.join(', ') + '). Without it every response row would count as a person. Add VANID (Edit Columns) or name the column in the Advanced block on Setup.');
      var missingQ = missingQuestions_(survey.records, sc, cfg.metrics);
      if (missingQ.missing.length) notes.push('WARNING: no loaded responses are for the question(s) ' + missingQ.missing.join(', ') + ', so those columns show 0. Questions found in the survey import: ' + (missingQ.found.join(', ') || 'none') + '. Check "Which survey question" on Setup (after an import the cell offers the questions found).');
      sc.vanId = vanIdCol;
      s = surveyHitsLong(survey.records, cfg.metrics, cfg.groups, sc, cfg.unassigned.code);
      var qs = Object.keys(s.questions).sort();
      notes.push(survey.records.length + ' survey response rows (Survey Response Report) covering ' + qs.length + ' question' + (qs.length === 1 ? '' : 's') + '; ' + s.unassigned + ' people whose canvasser is in no group (shown as ' + cfg.unassignedLabel + ')' + (s.badDates ? '; ' + s.badDates + ' with unreadable dates' : ''));
      cfg.metrics.forEach(function (m) {
        if (m.type !== 'survey_current_response') return;
        if (s.hits.some(function (h) { return h.metric === m.key; })) return;
        var seen = s.answers[m.key] || {};
        var list = Object.keys(seen).sort().map(function (a) { return '"' + a + '" (' + seen[a] + ')'; }).join(', ');
        notes.push('WARNING: "' + m.label + '" counted nobody: no one\'s latest answer to "' + m.valueColumn + '" is ' + m.responseName + (list ? '. Answers seen: ' + list : '. No responses to that question are loaded'));
      });
    } else {
      // Wide format: one row per person with a block of columns per question.
      checkMetricColumns_(survey.header, cfg.metrics);
      s = surveyHits(survey.records, cfg.metrics, cfg.groups, vanIdCol, cfg.unassigned.code);
      notes.push(survey.records.length + ' survey rows; ' + s.unassigned + ' responses by users not in any group (shown as ' + cfg.unassignedLabel + ')' + (s.badDates ? '; ' + s.badDates + ' with unreadable dates' : '') + (vanIdCol ? '' : '; no VanID column found, so people were not de-duplicated'));
    }
    hits = hits.concat(s.hits);
  }
  if (wantsShifts) {
    var shifts = readImportTab_(SHIFTS_TAB);
    if (!shifts) {
      var shiftCols = cfg.metrics.filter(isShiftMetric).map(function (m) { return '"' + m.label + '"'; });
      throw new Error('Setup has shift column' + (shiftCols.length === 1 ? '' : 's') + ' (' + shiftCols.join(', ') + ') but no shifts data is loaded. Import VAN\'s Event Participant Report (PTG → Import VAN export…), or clear those rows on Setup and run PTG → Build PTG tab again.');
    }
    var cols = shiftColumns_(shifts.header, cfg.columns);
    var e = shiftHits(shifts.records, cfg.metrics, cfg.groups, cols, { unassignedCode: cfg.unassigned.code, ignorePrefixes: cfg.ignorePrefixes, today: today });
    hits = hits.concat(e.hits);
    notes.push(shiftSummary_(shifts.records.length, e, cols, cfg));
  }

  var counted = cfg.metrics.filter(function (m) { return !isExternalMetric(m); });
  var rows = countHits(hits, cfg.weeks, groups, counted, today);
  if (externals.length) rows = rows.concat(readRawRows_().filter(function (r) { return cfg.metrics.some(function (m) { return isExternalMetric(m) && m.key === r.metric; }); }));   // keep what the warehouse wrote
  writeRaw_(rows, Utilities.formatDate(started, cfg.timezone, 'yyyy-MM-dd HH:mm'), Utilities.formatDate(started, cfg.timezone, 'MMMM d HH:mm'));
  notes.push(dashboardCheck_(rows));
  // Warnings first, one paragraph per topic: the alert box shows this as written.
  var warnings = notes.filter(function (n) { return n.indexOf('WARNING') === 0; });
  var rest = notes.filter(function (n) { return n.indexOf('WARNING') !== 0; });
  var summary = rows.length + ' rows written to raw.' + (warnings.length ? '\n\n' + warnings.join('\n\n') : '') + '\n\n' + rest.join('\n\n');
  log_('ok', summary);
  return summary;
}

/** One readable line about how completed shifts were credited, for the alert and the log. */
function shiftSummary_(rowCount, e, cols, cfg) {
  var parts = [rowCount + ' signup rows', e.completed + ' completed shifts'];
  var wantsType = cfg.metrics.some(function (m) { return isShiftMetric(m) && m.eventTypes.length; });
  if (wantsType && !cols.eventType) parts.push('WARNING: a metric filters by event type but the export has no event-type column, so it counts nothing');
  if (cols.credit) parts.push(e.by.credit + ' credited by "' + cols.credit + '"');
  if (cols.organizer && e.by.organizer) parts.push(e.by.organizer + ' by the volunteer\'s "' + cols.organizer + '"');
  if (e.by.prefix) parts.push(e.by.prefix + ' by event prefix');
  if (e.by.catchall) parts.push(e.by.catchall + ' by the catch-all prefix');
  if (e.unassigned) {
    var why = [];
    if (e.by.no_credit) why.push(e.by.no_credit + ' with no "' + cols.credit + '"');
    if (e.by.unlisted_credit) why.push(e.by.unlisted_credit + ' with a "' + cols.credit + '" not listed in any group');
    if (e.by.no_prefix) why.push(e.by.no_prefix + ' at events matching no group prefix');
    parts.push(e.unassigned + ' shown as ' + cfg.unassignedLabel + ' (' + why.join('; ') + ')');
  }
  if (e.ignored) parts.push(e.ignored + ' ignored at events starting with ' + cfg.ignorePrefixes.map(function (p) { return '"' + p + '"'; }).join(' or '));
  if (e.unmarkedPast) parts.push(e.unmarkedPast + ' past shifts still Scheduled/Confirmed, not counted');
  if (e.badDates) parts.push(e.badDates + ' with unreadable dates');
  if (e.noVanId) parts.push(e.noVanId + ' rows with no VANID (counted as shifts, not as people)');
  if (!cols.shift) parts.push('no shift column found, so two shifts by one person at the same event on the same day count once (name it in the Advanced block on Setup)');
  return parts.join('; ');
}

/**
 * Resolve the survey export's columns. `question` is null for a per-person (wide) export.
 * For the long format, response, date and canvasser default to VAN's names and must exist.
 */
function surveyColumns_(header, configured) {
  var c = {
    question: resolveColumn(header, configured.surveyQuestion, COLUMN_CANDIDATES.surveyQuestion),
    response: resolveColumn(header, configured.surveyResponse, COLUMN_CANDIDATES.surveyResponse),
    date: resolveColumn(header, configured.surveyDate, COLUMN_CANDIDATES.surveyDate),
    canvasser: resolveColumn(header, configured.surveyCanvasser, COLUMN_CANDIDATES.surveyCanvasser),
    flag: resolveColumn(header, configured.surveyFlag, COLUMN_CANDIDATES.surveyFlag),
    id: resolveColumn(header, configured.surveyResponseId, COLUMN_CANDIDATES.surveyResponseId)
  };
  if (c.question) {
    var missing = [];
    if (!c.response) missing.push('response (tried ' + COLUMN_CANDIDATES.surveyResponse.join(', ') + ')');
    if (!c.date) missing.push('date (tried ' + COLUMN_CANDIDATES.surveyDate.join(', ') + ')');
    if (!c.canvasser) missing.push('canvasser (tried ' + COLUMN_CANDIDATES.surveyCanvasser.join(', ') + ')');
    if (missing.length) throw new Error('The survey export looks like a Survey Response Report but is missing columns: ' + missing.join('; ') + '. Columns found: ' + header.join(', ') + '. Name them in the Advanced block on Setup.');
  }
  return c;
}

/** Long format: which survey metrics name a question that no loaded row is for. Returns {missing: ['"Q" (label)'], found: [names]}. */
function missingQuestions_(records, cols, metrics) {
  var found = {};
  records.forEach(function (r) { var q = norm(r[cols.question]); if (q) found[q] = String(r[cols.question]).trim(); });
  var missing = [];
  metrics.forEach(function (m) {
    if (isShiftMetric(m)) return;
    if (!found[norm(m.valueColumn)]) missing.push('"' + m.valueColumn + '" (' + m.label + ')');
  });
  return { missing: missing, found: Object.keys(found).map(function (k) { return found[k]; }).sort() };
}

/** Wide format: every survey metric's three columns must exist in the export header. */
function checkMetricColumns_(header, metrics) {
  var have = header.map(norm), missing = [];
  metrics.forEach(function (m) {
    if (isShiftMetric(m)) return;
    if (!m.dateColumn || !m.canvasserColumn) { missing.push('a date_column and canvasser_column for metric ' + m.key + ' (this export is one row per person, so each question needs its own date and canvasser columns)'); return; }
    [m.valueColumn, m.dateColumn, m.canvasserColumn].forEach(function (c) {
      if (have.indexOf(norm(c)) < 0) missing.push('"' + c + '" (metric ' + m.key + ')');
    });
  });
  if (missing.length) throw new Error('The survey export has no column named ' + missing.join(', ') + '. Columns found: ' + header.join(', '));
}

/** Resolve the shifts export's columns, erroring on anything required that's missing. */
function shiftColumns_(header, configured) {
  var cols = {}, missing = [];
  var optional = ['shiftShift', 'shiftCredit', 'shiftEventType', 'shiftOrganizer'];
  ['shiftEventName', 'shiftEventDate', 'shiftStatus', 'shiftVanId'].concat(optional).forEach(function (k) {
    cols[k] = resolveColumn(header, configured[k], COLUMN_CANDIDATES[k]);
    if (!cols[k] && optional.indexOf(k) < 0) missing.push(k.replace('shift', '') + (configured[k] ? ' ("' + configured[k] + '")' : ' (tried ' + COLUMN_CANDIDATES[k].join(', ') + ')'));
  });
  if (missing.length) throw new Error('The shifts export is missing columns: ' + missing.join('; ') + '. Columns found: ' + header.join(', ') + '. Name them in the Advanced block on Setup.');
  return { eventName: cols.shiftEventName, eventDate: cols.shiftEventDate, status: cols.shiftStatus, vanId: cols.shiftVanId, shift: cols.shiftShift, credit: cols.shiftCredit, eventType: cols.shiftEventType, organizer: cols.shiftOrganizer };
}

/* ---------- menu actions ---------- */

/** Run from the import dialog's button. Returns the summary; errors are logged and re-thrown for the dialog to show. */
function runFromDialog() {
  try {
    return run_();
  } catch (err) {
    log_('error', err.message);
    throw err;
  }
}

function runNow() {
  var ui = SpreadsheetApp.getUi();
  try {
    ui.alert('Done. ' + run_() + '\n\nSee the PTG tab.');
  } catch (err) {
    log_('error', err.message);
    ui.alert('Run failed:\n\n' + err.message + '\n\nThe log tab has details.');
  }
}

function buildSheet() {
  var ui = SpreadsheetApp.getUi();
  buildReadme_();
  var fresh = buildSetup_();
  getOrCreate_(LOG_TAB);
  var legacy = SpreadsheetApp.getActive().getSheetByName(OLD_README_TAB);
  if (legacy && legacy.getLastRow() > 0) {
    if (SpreadsheetApp.getActive().getSheetByName('README (old)')) SpreadsheetApp.getActive().deleteSheet(legacy);   // already kept once
    else legacy.setName('README (old)');   // keep the old text, make room for the new tab
  }
  ui.alert(fresh
    ? 'Created README, Setup and log tabs with sample values. Fill in Setup (hover a column header for what goes there), then run PTG → Build PTG tab.'
    : 'Setup already exists, so it was left alone. To start over from the current sample values and field notes, use PTG → Reset Setup and README to sample values. Otherwise run PTG → Build PTG tab when Setup is filled in.');
}

/** Replace Setup and README with the current sample values and field notes. Asks first; goals and imports are untouched. */
function resetSetup() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert('Reset Setup and README?', 'This replaces everything on the Setup and "README: Start here" tabs with the sample values and field notes from the current code, and removes any older README tab. Your goals on the PTG tab and your imported VAN data are not touched. Copy anything you typed on Setup first.', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  [SETUP_TAB, README_TAB, OLD_README_TAB, OLD_README_TAB + ' (old)'].forEach(function (n) {
    var s = SpreadsheetApp.getActive().getSheetByName(n);
    if (!s) return;
    if (n !== SETUP_TAB && n !== README_TAB) { SpreadsheetApp.getActive().deleteSheet(s); return; }   // older README tabs; the tab is now "README: Start here"
    s.clear(); s.clearNotes(); s.clearDataValidations();
  });
  buildReadme_();
  buildSetup_();
  refreshSetupDropdowns_();
  ui.alert('Setup and README rebuilt. Fill in Setup (hover a header for what goes in each column), then PTG → Build PTG tab.');
}

function buildPtgTab() {
  var ui = SpreadsheetApp.getUi();
  try {
    var cfg = readConfig();
    buildPtg_(cfg);
    ui.alert('PTG tab built for ' + cfg.weeks.length + ' weeks, ' + cfg.groups.length + ' groups and ' + cfg.metrics.length + ' metrics. Type goals into the yellow cells.' + (cfg.warnings.length ? '\n\nWARNING: ' + cfg.warnings.join('\n\nWARNING: ') : ''));
  } catch (err) {
    ui.alert('Could not build:\n\n' + err.message);
  }
}

/** For warehouse-fed sheets: does the dashboard find its rows in raw? */
function checkDashboard() {
  var ui = SpreadsheetApp.getUi();
  try {
    var cfg = readConfig();
    if (!ptgMatchesConfig_(cfg)) buildPtg_(cfg);
    ui.alert(dashboardCheck_(readRawRows_()));
  } catch (err) {
    ui.alert('Could not check:\n\n' + err.message);
  }
}

/** Lists the headers of whatever is imported, so users can copy exact names into Setup. */
function showImportedColumns() {
  var lines = [SURVEY_TAB, SHIFTS_TAB].map(function (n) {
    var t = readImportTab_(n);
    return n + ': ' + (t ? t.records.length + ' rows\n  ' + t.header.join(' | ') : 'nothing imported');
  });
  SpreadsheetApp.getUi().alert(lines.join('\n\n'));
}
