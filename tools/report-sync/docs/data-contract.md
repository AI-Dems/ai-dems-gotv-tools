# Data contract

The pieces other things can depend on: the Setup tab layout, the shape of a report tab, the log, the export formats the upload accepts, and the web app API between the optional runner and the sheet. Add to these; don't rename or reorder.

## Setup tab

Three blocks, each starting with a bold label in column A (a parenthetical suffix like "(automatic runner only)" is ignored) and ending at the first blank row. Row positions don't matter; labels do. Only **Reports** matters for manual uploads, and only to fill the tab dropdown.

**Status** (written by the runner; column B)

| Label | Value |
|---|---|
| Runner last seen | Timestamp of the last request from any runner |
| Last pass | Timestamp of the last finished pass |
| Last pass result | e.g. `2/2 OK (My Campaign)` |

**Settings** (A = label, B = value)

| Label | Type | Default |
|---|---|---|
| Timezone | IANA zone name | `America/New_York` |
| Sync every (minutes) | number ≥ 1 | 30 |
| Active hours start (0-23) | number | 9 |
| Active hours end (1-24) | number, > start | 21 |
| Export format (xls or csv) | `xls` or `csv` | `xls` |

**Reports** (header row, then one row per report)

| Column | Values |
|---|---|
| database | `My Campaign` or `My Voters` |
| report_name | Saved template name in Report Manager |
| tab | Target tab; not `Setup`, `README` or `log`; unique |
| enabled | `yes`/`no`/blank (blank = yes) |

## Accepted upload files

| File | How it's read |
|---|---|
| `.zip` from My Export Files | Unzipped; must contain exactly one `.xls` or `.csv` |
| `.xls` | UTF-16LE tab-separated text with a BOM (Votebuilder's "Excel" export). A real binary workbook is refused. |
| `.csv` | UTF-8, a leading `sep=,` line is dropped. Some "Last, First" fields arrive unquoted; that's Votebuilder's bug, not fixable here. |

Trailing blank rows are dropped. The first row is taken as the header and remembered (lower-cased, tab-joined, in document properties under `HEADER:<header>` → tab) to suggest the tab next time.

## Report tabs

Replaced as a block from A1 each pass. Row 1 is the report's header as Votebuilder exported it. Values are entered as the user would type them (`USER_ENTERED` semantics in Sheets terms: numbers and dates convert). Rows and columns beyond the new block are cleared, never deleted, so the grid only grows. Formatting, filters and the tab's id survive.

Because the runner sends whatever Report Manager produces, column order is the report's. Formulas in other tabs should look columns up by header.

## log tab

One row per report per pass, appended; trimmed to about 2,000 rows.

| Column | Meaning |
|---|---|
| Timestamp | When the row was written |
| Report | Saved template name (runner) or the export file's name (upload) |
| Database | `My Campaign` / `My Voters` from the runner; `upload` for manual uploads |
| Tab | Target tab |
| Export File | Votebuilder's file name, e.g. `EventParticipantReport-….xls` |
| Rows | Rows written, including the header |
| Status | `OK` or `Error` |
| Details | Error message, blank on success |

## Web app API (optional runner)

For the runner only, the sheet's Apps Script is deployed as a web app (execute as the sheet owner, access anyone). Every request carries `token`, which must equal the `SYNC_TOKEN` script property. All responses are JSON `{ok: true, …}` or `{ok: false, error}`. Google answers POSTs with a redirect to the result; clients must follow it.

| Request | Response |
|---|---|
| `GET ?token&action=ping` | `{ok, sheet}` — the spreadsheet's name |
| `GET ?token&action=config` | `{ok, config}` — the parsed Setup tab: `{timezone, everyMin, hours:{start,end}, format, reports:[{database,name,tab,enabled}]}` |
| `POST {token, action:"replace", tab, rows, report, database, file}` | `{ok, rows}` — replaces `tab` with `rows` (array of arrays of strings) and logs an OK row |
| `POST {token, action:"log", records:[{timestamp?, report, database, tab, file?, rows?, status, details?}]}` | `{ok}` — appends rows to `log` |
| `POST {token, action:"heartbeat", summary?}` | `{ok}` — updates *Runner last seen*; with `summary`, also *Last pass* and *Last pass result* |

POST bodies are JSON sent as `text/plain` (Apps Script doesn't parse `application/json` differently, and `text/plain` avoids a CORS preflight). Requests are serialized with a script lock, so two runners never write at once.

Anything that can produce `{tab, rows}` can feed a tab through `replace`: the Playwright runner is one producer, but a warehouse job or a cron on a server could use the same endpoint.

## Runner files

| Path (inside `runner/`) | Contents |
|---|---|
| `.env` | URL, token, Votebuilder logins. Mode 600, git-ignored |
| `profiles/<account>/` | Chromium profile holding that account's Votebuilder session |
| `logs/<account>.log` | Everything that account's runner printed |
| `logs/<account>.lock` | PID of the running runner |
| `logs/<account>.service.log` | stdout/stderr from the background service |
| `downloads/<account>/<run>/` | Exports, deleted after 1 day |
| `failures/<account>/` | Screenshot + HTML when a report fails, deleted after 1 day |
