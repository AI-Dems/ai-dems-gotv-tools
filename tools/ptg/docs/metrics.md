# Metric definitions

What each number on the PTG tab means, precisely, and how it differs from the original New Hampshire version. Read this before arguing with an organizer about their numbers.

## Rules shared by every metric

- **Weekly, not cumulative.** A cell is what happened in that week only. Weeks run from the `Week starts on` day for 7 days. The final week runs through election day, so `Oct 26 - Nov 3` is 9 days when election day is a Tuesday.
- **Only the program window counts.** The program start is snapped back to the start of its week, and anything dated before that day or after election day is ignored. Each week shows `-` until it begins.
- **Recomputed from scratch every run** from whatever is currently imported. A late edit in VAN changes the number in whatever week it belongs to, once you re-export. Numbers are never frozen.
- **Distinct counts.** A person is counted once per survey metric; a shift once per person + event + date + shift, even if VAN exports duplicate rows.
- **Nothing is silently dropped.** A response recorded by a VAN user not listed in any group, or a shift that no group claims, lands on the **Unassigned** row (its label is a Setting) and still counts toward the total row. The run summary says how many and why. Rows whose date can't be read are dropped and counted.
- **Dates are read as calendar days.** Time of day is ignored; VAN exports in the committee's local time.

## Survey-based metrics

Source: the imported survey rows, in either of two shapes. The sheet picks the shape from the headers.

**Survey Response Report (one row per response; preferred).** Columns `Survey Question Name`, `Survey Response`, `Date Canvassed`, `Canvassed By`, and optionally `Is Most Recent Response` and `Survey Response ID`, all auto-detected (or named in the Columns block). Each metric's `value_column` is the question's name; only rows for that question count. Because the report covers 30 days at a time and imports accumulate, "first response" means the earliest response in the rows you have loaded, and "current response" means the latest by date (VAN's most-recent flag breaks same-day ties). Load from the program start to keep both meanings exact.

**Per-person list export (one row per person).** Each metric names three columns in it: the response, the date it was recorded, and who recorded it.

### `survey_first_response` (default name: Signups)

A person counts in the week of the date in `date_column`, if `value_column` is non-blank, whatever the answer. If the export has several rows for the same VanID (a one-row-per-contact export), the earliest date wins. One per person for the whole program.

Credited to the group of the VAN user in `canvasser_column`.

### `survey_current_response` (default name: Confirmed Leaders)

A person counts in the week of `date_column` only if `value_column` equals `response_name` (case-insensitive, otherwise exact). `response_name` may list several answers separated by semicolons (`Yes; Maybe`; commas work when no answer contains one), or be `*` for any answer. If they are later moved to a different answer and you re-export, they disappear from the week they were in. If moved back, they reappear in the week of the new entry.

Credited to the group of the VAN user in `canvasser_column`.

### How these differ from the NH original

| | NH original (DSCC warehouse) | This version (VAN exports) |
|---|---|---|
| Who a person is credited to | The person's own turf from a warehouse table, regardless of who entered the data | The group of the VAN user who entered the response |
| "First response" | True first response, from full history | Whatever date the export carries for the response. A per-person list export carries the current response's date; a contact-history export carries every entry, and the earliest is used. |
| Freshness | Nightly, automatic | Whenever someone exports and imports |

The crediting change is deliberate: it needs no warehouse and it is how organizer-level (regional) PTGs already think. For a turf PTG, make sure every organizer who enters data for a turf is listed under that turf.

## Event-based metrics

Source: the imported shifts export (VAN's Event Participant Report), one row per signup. All of them can be limited to certain event types with the `event_type` column on Setup (below).

### `shifts_completed` (default name: Shifts Completed)

A signup counts if its status is `Completed`, in the week of the event date. A person who completes two shifts at the same event counts twice; VAN duplicate rows for the same shift count once.

### `shifts_scheduled` (Shifts Scheduled)

Every commitment that came, or will come, due that week, by event date: status `Scheduled`, `Confirmed`, `Sched-Web`, `Confrm-Web`, `Completed` or `No Show`. `Declined`, `DeclineWeb`, `Cancelled` and `Invited` are not commitments. For a past week this is "shifts that came due"; for the current week it is the schedule. Weeks appear on the dashboard once they start, so export signups through election day to see the current week's schedule fill in.

### `shifts_flaked` (No-shows)

Signups with status `No Show`, by event date. Flake rate is this divided by `shifts_scheduled` for the same week; put both on the dashboard and compare. `Declined` is not a flake: the person said no before the shift. This is a **lower-is-better** metric: on the dashboard its yellow cell is a *Max* rather than a goal, the bar fills toward the maximum, and the column turns red once the count passes it.

### `active_volunteers` (Active Volunteers)

Distinct people with at least one `Completed` shift that week. Credited to the group of the shift; a person who completed shifts for two groups in one week counts once in each.

### `new_volunteers` (New Volunteers)

People whose **first** `Completed` shift in the export falls that week, credited to the group of that shift. "First" means first in the file, so export from the start of the program (or earlier) or long-time volunteers will look new.

### `event_type` filter

Put one or more Event Type values from the export (comma-separated, matched ignoring case) in the metric's `event_type` cell to count only those events: `Canvass`, `Phone Bank`, `One on One`… Blank counts everything. The export's `Event Type` column is auto-detected; if your export lacks one and a metric filters on it, the run warns and that metric counts nothing. This is how one-on-ones and phone-bank shifts get their own columns from the same export.

**Who gets the shift**, in order:

1. **The credit column.** If the export has a column naming who recruited the volunteer (VAN's `Recruited By`, auto-detected; or the header you put in *Shifts export: credit column* on Setup) and that name is in a group's `van_users`, the shift is theirs. Names match by their words, so `Jane Doe`, `Doe, Jane` and `doe jane` are the same person, and a cell holding only `Doe` matches when exactly one listed user has that word in their name (VAN's CSV export splits `Last, First` across two cells).
2. **An event prefix.** The group whose `event_prefixes` match the start of the event name.
3. **The catch-all.** A group whose `event_prefixes` include `*` takes every remaining shift. Use it for "all events" when the campaign has no naming convention.
4. Otherwise the **Unassigned** row. The run summary separates "no `Recruited By`" (usually web signups) from "a `Recruited By` not listed in any group" (add that person to Setup).

The `*` group also takes **survey responses** whose canvasser is not listed under any group, so with a `*` row nothing lands on Unassigned unless the canvasser cell is blank.

**Cancelled events.** Events whose name starts with `[Cancelled]` (the *Ignore events starting with* Setting; type `none` to disable) are skipped even when their signups are still marked Completed in VAN. The run summary says how many were skipped.

**Unmarked shifts.** Past shifts still `Scheduled`, `Confirmed`, `Sched-Web` or `Confrm-Web` were never marked Completed, so they don't count. The run summary reports how many, so the field team knows to go mark them.

The NH original credited shifts at non-prefixed events to the person's turf from a warehouse table; this version uses the recruiter instead.

## Adding a metric

Add a row to the Metrics table on Setup and run **PTG → Build PTG tab**. Make sure the survey export includes the new question's columns. Examples:

| metric_key | label | type | value_column | date_column | canvasser_column | response_name | event_type |
|---|---|---|---|---|---|---|---|
| `commits` | Vote Commitments | `survey_current_response` | `Vote Plan` | `Vote Plan Date` | `Vote Plan Canvasser` | `1 - Strong Support` | |
| `recruits` | Volunteer Asks | `survey_first_response` | `Vol Ask` | `Vol Ask Date` | `Vol Ask Canvasser` | | |
| `one_on_ones` | One-on-Ones | `shifts_completed` | | | | | `One on One` |
| `phone_shifts` | Phone Bank Shifts | `shifts_scheduled` | | | | | `Phone Bank` |

A metric type that isn't one of the above (say, doors knocked from a contact-history export) needs a small addition to `Metrics.js` and `Main.js`. Open an issue.
