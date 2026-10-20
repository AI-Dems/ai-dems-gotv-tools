// Run with `npm test`. Setup parsing: plain headers, Sam's machine headers, example rows, derived keys, errors.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../Config.js');

const settings = [['Settings'], ['Campaign name', 'T'], ['Program start date', '2026-10-05'], ['Election day', '2026-11-03'], ['Week starts on', 'Monday'], ['Timezone', 'America/New_York'], ['Dashboard title', 'T'], ['Total row label', 'TOTAL'], ['Unassigned row label', ''], ['Ignore events starting with', ''], []];
const W = 8; const pad = (rows) => rows.map((r) => { const x = r.slice(); while (x.length < W) x.push(''); return x; });

test('plain-language Setup: headers by name, example rows skipped, blank rows inside a block skipped, keys derived', () => {
  const values = pad(settings.concat([
    ['Groups'], ['Name on dashboard', 'Their name in VAN', 'Or events starting with'],
    ['Example: Jane Doe', 'Doe, Jane;', ''], ['Jane Doe', 'Doe, Jane;', ''], [], ['Everyone else', '', '*'], [],
    ['Metrics'], ['Column on dashboard', 'What to count', 'Which survey question', 'Which answer counts', 'Only these event types'],
    ['Example: Shifts Completed', 'Completed shifts', '', '', ''],
    ['Shifts Completed', 'Completed shifts', '', '', ''], ['Canvass Shifts', 'completed shifts', '', '', 'Canvass'],
    ['Volunteer Signups', 'People who first answered a survey question', '2026 Rivet Vol', '', ''],
    ['Said Yes', 'People whose current answer is…', '2026 Rivet Vol', 'Yes', ''], [],
    ['Advanced', '(leave blank)'], ['Shifts export: shift column (optional)', 'Shift Start Time'],
  ]));
  const cfg = C.parseSetup(values, 'America/New_York');
  assert.deepEqual(cfg.groups.map((g) => [g.code, g.name, g.vanUsers, g.eventPrefixes]), [['jane_doe', 'Jane Doe', ['Doe, Jane'], []], ['everyone_else', 'Everyone else', [], ['*']]]);
  assert.deepEqual(cfg.metrics.map((m) => [m.key, m.type]), [['shifts_completed', 'shifts_completed'], ['canvass_shifts', 'shifts_completed'], ['volunteer_signups', 'survey_first_response'], ['said_yes', 'survey_current_response']]);
  assert.deepEqual(cfg.metrics[1].eventTypes, ['Canvass']);
  assert.equal(cfg.metrics[3].valueColumn, '2026 Rivet Vol'); assert.equal(cfg.metrics[3].responseName, 'Yes');
  assert.equal(cfg.columns.shiftShift, 'Shift Start Time');
  assert.equal(cfg.weeks.length, 4);
});

test("Sam's original machine-name headers still parse the same", () => {
  const values = pad(settings.concat([
    ['Groups'], ['group_code', 'display_name', 'van_users', 'event_prefixes'], ['CMP-A', 'Dartmouth', 'jdoe, mlee', 'CMPA_'], [],
    ['Metrics'], ['metric_key', 'label', 'type', 'value_column', 'date_column', 'canvasser_column', 'response_name', 'event_type'],
    ['signups', 'Signups', 'survey_first_response', 'Pappas Support', 'Pappas Support Date', 'Pappas Support Canvasser', '', ''],
    ['shifts_complete', 'Shifts Completed', 'shifts_completed', '', '', '', '', ''], [],
    ['Columns', '(leave blank to auto-detect)'], ['Survey export: VanID column', ''],
  ]));
  const cfg = C.parseSetup(values, 'America/New_York');
  assert.deepEqual(cfg.groups[0], { code: 'CMP-A', name: 'Dartmouth', vanUsers: ['jdoe', 'mlee'], eventPrefixes: ['CMPA_'] });
  assert.equal(cfg.metrics[0].key, 'signups'); assert.equal(cfg.metrics[0].dateColumn, 'Pappas Support Date');
  assert.equal(cfg.metrics[1].key, 'shifts_complete');
});

test('two dashboard columns with the same label get distinct keys', () => {
  const values = pad(settings.concat([['Groups'], ['Name on dashboard'], ['A'], [], ['Metrics'], ['Column on dashboard', 'What to count', 'Only these event types'], ['Shifts', 'Completed shifts', 'Canvass'], ['Shifts', 'Completed shifts', 'Phone Bank']]));
  assert.deepEqual(C.parseSetup(values).metrics.map((m) => m.key), ['shifts', 'shifts_2']);
});

test('errors name the sheet row and column', () => {
  const base = settings.concat([['Groups'], ['Name on dashboard'], ['A'], [], ['Metrics'], ['Column on dashboard', 'What to count', 'Which survey question', 'Which answer counts']]);
  assert.throws(() => C.parseSetup(pad(base.concat([['Shifts', 'shifts_complete_xyz', '', '']]))), /Setup row 18, column B \("What to count"\): "shifts_complete_xyz" is not one of the choices/);
  assert.throws(() => C.parseSetup(pad(base.concat([['Signups', 'People who first answered a survey question', '', '']]))), /Setup row 18, column C \("Which survey question"\) is blank/);
  assert.throws(() => C.parseSetup(pad(base.concat([['Yes', 'People whose current answer is…', 'Q', '']]))), /column D \("Which answer counts"\) is blank/);
  assert.throws(() => C.parseSetup(pad(base.concat([['', 'Completed shifts', '', '']]))), /column A \("Column on dashboard"\) is blank/);
  assert.throws(() => C.parseSetup(pad(settings.concat([['Groups'], ['Name on dashboard'], [], ['Metrics'], ['Column on dashboard', 'What to count'], ['S', 'Completed shifts']]))), /Groups: add at least one row/);
});

test('a bad date in Settings is explained', () => {
  const bad = settings.map((r) => r[0] === 'Program start date' ? ['Program start date', 'Oct 5'] : r);
  assert.throws(() => C.parseSetup(pad(bad.concat([['Groups'], ['Name on dashboard'], ['A'], [], ['Metrics'], ['Column on dashboard', 'What to count'], ['S', 'Completed shifts']]))), /"Program start date" must be a date written yyyy-mm-dd/);
});

test('slug_ and the phrase list', () => {
  assert.equal(C.slug_('Shifts Completed'), 'shifts_completed');
  assert.equal(C.slug_('  Said "Yes"!  '), 'said_yes');
  assert.equal(C.slug_('***'), 'item');
  assert.equal(C.typePhrases_().length, 8, 'seven counting rules plus Fed from outside');
  assert.equal(C.normalizeType('People whose current answer is…'), 'survey_current_response');
  assert.equal(C.normalizeType('Scheduled shifts (commitments)'), 'shifts_scheduled');
});
