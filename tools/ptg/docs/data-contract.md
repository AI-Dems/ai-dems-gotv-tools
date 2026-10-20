# Data contract: the `raw` tab

The PTG dashboard reads only the hidden `raw` tab. Anything that writes `raw` in this shape makes the dashboard work: the built-in run over imported VAN exports, a BigQuery or Civis export, a Portal job, or a CSV someone pastes in. This is how a campaign with a data warehouse (the original NH setup) can keep its own SQL and still use the shared sheet.

## Columns

Header row is row 1. One row per **week × group × metric**, including zeros. Column order matters; add new columns on the right only.

| # | Column | Type | Example | Notes |
|---|---|---|---|---|
| A | `key` | text | `Oct 5 - 11\|CMP-A\|signups` | `week_label` + `\|` + `group_code` + `\|` + `metric_key`. The PTG tab looks up this column. |
| B | `metric_key` | text | `signups` | Must match row 1 of the PTG tab |
| C | `metric_label` | text | `Signups` | Informational |
| D | `group_code` | text | `CMP-A` | Must match column C of the group's row on PTG. `UNASSIGNED` is the automatic row for counts no group claimed |
| E | `week_start` | `yyyy-MM-dd` | `2026-10-05` | Informational |
| F | `week_label` | text | `Oct 5 - 11` | Must match the week header text on PTG exactly |
| G | `value` | integer | `2` | The number shown |
| H | `run_timestamp` | `yyyy-MM-dd HH:mm` | `2026-10-13 10:53` | Campaign timezone |
| I | `run_label` | text | `October 13 10:53` | Shown as "Last updated" on PTG, read from row 2 |

## Week labels

`<Mon> <d> - <d>` when the week stays in one month, `<Mon> <d> - <Mon> <d>` when it crosses one: `Oct 5 - 11`, `Oct 26 - Nov 3`. Three-letter month, no leading zeros, spaces around the hyphen. The PTG tab generates its headers with the same function (`weekLabel` in `Metrics.js`), so a feeder that uses this format will always match.

Only emit rows for weeks that have started. Weeks absent from `raw` show `-` on the dashboard.

## Feeding `raw` from a warehouse

Set **Raw tab is fed from outside** to `Yes` on Setup. **Run now** then recounts nothing: it rebuilds the dashboard if Setup changed and reports whether every dashboard cell finds its row in `raw` (also available as **PTG → Check dashboard against raw**). Have your warehouse overwrite the `raw` tab daily, header included. The original NH `campus_ptg.sql` produces almost this shape; add the `key` column and rename `fo_name` → `group_code`, `reporting_week` → `week_start`, `reporting_week_label` → `week_label`, `metric_value` → `value`, `run_timestamp_et` → `run_timestamp`, `run_timestamp_label` → `run_label`.

A mixed sheet works too: pick *Fed from outside (warehouse writes raw)* as **What to count** for the columns the warehouse supplies and leave the rest on VAN exports. Run now recounts the VAN columns and keeps the warehouse rows for the others.

### The keys you must reproduce

- `metric_key` is the metric's **Short code** on Setup; when that cell is blank it is made from the column name: lower case, non-letters to `_`, so `Doors Knocked` → `doors_knocked`, and a second column with the same name gets `_2`. Fill in the Short code for anything a warehouse writes, so the key cannot drift when someone renames a column.
- `group_code` is the group's **Short code (optional)** on Setup, else made from *Name on dashboard* the same way (`Jane Doe` → `jane_doe`).
- The automatic Unassigned row has `group_code` `UNASSIGNED`. Write a row for it (value 0 is fine) or its cell shows `-`.
- `week_label` must match `weekLabel()` in `Metrics.js`, including the last week running through election day.

## What the PTG tab assumes

- Row 1 of PTG holds machine keys: `<metric_key>`, `<metric_key>_goal`, `ptg`, `sparkline` per metric block, starting at column F, five columns per block.
- Column A marks row types: `total`, `group` or `unassigned`. Column C holds the group code (group rows, and `UNASSIGNED` on the unassigned row) or the week label (week header rows). The unassigned row has a count but no goal or PTG cells; the total row includes it.
- Goal cells are plain values typed by hand. Everything else in the metric blocks is a formula.

These are produced by `buildPtg_` in `Sheet.js`; `readGoals_` relies on the same layout to preserve goals across rebuilds.
