# Troubleshooting

Start with the **log** tab. Every import and run writes one line: `import` with the columns found, `ok` with counts, or `error` with the message. The newest line is at the bottom.

## The PTG menu isn't there

Reload the page and wait ten seconds. If it still doesn't appear, open **Extensions → Apps Script**; if the editor is empty, the copy didn't bring the script along. Make a fresh copy of the template.

## "Specified permissions are not sufficient to call Ui.showModalDialog"

The copy's permission list is missing the one the import dialog needs (fixed in the template in Oct 2026; older copies still have it). In the copy: **Extensions → Apps Script → Project Settings → tick "Show appsscript.json manifest file in editor"**, open `appsscript.json`, and make `oauthScopes` read:

```
"oauthScopes": [
  "https://www.googleapis.com/auth/spreadsheets.currentonly",
  "https://www.googleapis.com/auth/script.container.ui"
]
```

Save, reload the sheet, approve the new authorization prompt on the next menu click. Meanwhile, File → Import onto the hidden import tab works without the dialog.

## "Setup has survey columns (…) but no survey data is loaded" / "…shift columns…"

The columns named in the message need a report that hasn't been imported: the Survey Response Report for survey columns, the Event Participant Report for shift columns. Import or paste it (**PTG → Import VAN export…**), or clear those rows on Setup and run **PTG → Build PTG tab** again to track only what you have. If you used File → Import, make sure you imported onto the tab named exactly `VAN survey export` or `VAN shifts export` with "Replace current sheet".

If the import dialog said it loaded your shifts file into **"VAN survey export"**, the file's first line was not the header (VAN's report downloads start with a `SEP=,` line). Copies made before Oct 2026 read that line as the header; update `Import.js` from the repo, or File → Import the file onto the `VAN shifts export` tab.

## "This does not look like a report the sheet knows"

The sheet reads two VAN reports: the Event Participant Report (it has an `Event Name` column) and the Survey Response Report (it has a `Survey Question Name` column). A Contact History, Activist Codes or other report is refused rather than guessed at, and nothing is imported. If the file *is* one of the two reports but its headers are worded differently, name them in the Advanced block on Setup.

## My report has no Export button

Exporting is a per-report permission set by the committee's VAN admin. The Event Participant Report usually has it; the Survey Response, Contact History and Activist Codes reports often don't for standard users. Two ways through: ask the admin to enable Export on the Survey Response Report for your login, or copy the table from the page and paste it into **PTG → Import VAN export… → Import pasted rows**, one page of 100 rows at a time.

## I pasted the second page and the row count barely moved

Rows that are already loaded are skipped, and so are repeated header rows. The dialog says how many were added, how many skipped, and which rule recognized duplicates: `Survey Response ID` (exact), the natural key VANID + question + answer + date + canvasser, or, with a WARNING, every cell. If "added" is 0 and you expected new rows, you probably pasted the same page twice. If the dialog shows the WARNING, re-import with **Edit Columns → Select All** so the ID column is included.

## "Setup row N, column B ("What to count"): … is not one of the choices"

*What to count* is the tool's own menu of seven counting rules, not something from VAN. Pick from the dropdown, or type a close spelling (`shifts complete`, `no shows`, `active`). Every Setup error names the sheet row and column to fix.

## My Setup tab still has group_code / metric_key headers

That is the older layout; it keeps working. To switch to the plain-language layout with examples, hover notes and dropdowns, copy your rows somewhere, run **PTG → Reset Setup and README to sample values…**, and re-enter them.

## "WARNING: no loaded responses are for the question(s) …"

With a Survey Response Report, each survey column's *Which survey question* must be the question's name exactly as it appears in the report's `Survey Question Name` column. The run still completes and that column shows 0; the message lists the questions found, and after an import the Setup cell offers them as a dropdown.

## Every shift is on the Unassigned row

Shifts are credited by the export's `Recruited By` name matched against *Their name in VAN*, then by *Or events starting with*. Read the run summary: "with no Recruited By" means VAN has no recruiter on those signups (common for web signups; nothing to fix in the sheet); "with a Recruited By not listed in any group" means a staffer is missing from *Their name in VAN* (after an import the cell offers the names found, each ending in a semicolon when VAN writes it `Last, First`). Put `*` in one group's *Or events starting with* to sweep everything else into that group instead of Unassigned.

## A metric filters by event type and shows 0

The export has no `Event Type` column, or the value is spelled differently. **PTG → Show imported columns** lists the headers; unhide the import tab to see the values. The run summary warns when the column is missing.

## The import dialog put my file on the wrong tab

It decides by headers: a file with an event-name column (`Event Name`, or whatever the Columns block says) is treated as the shifts export. If your survey export happens to have such a column, remove it from the VAN export, or import that file with File → Import onto the right tab instead.

## "The survey export has no column named …"

The `value_column` / `date_column` / `canvasser_column` on Setup doesn't match a header in the file. The message lists every header found; **PTG → Show imported columns** shows the same. Copy the exact header into Setup. Spelling and punctuation matter, case doesn't.

If the export has the response but no date or canvasser column for it, VAN's list export field group doesn't include them; use the Contact History export of the same list (one row per contact) instead. See the setup guide, step 5.

## "The shifts export is missing columns …"

Auto-detection didn't find event name, event date, status or VanID. The message shows what it tried and what the file has. Fill the matching row in the **Columns** block on Setup with the header from your file.

## Every cell on the PTG tab shows "-" after a run

The run summary now ends with a **Dashboard** line. "N of N cells … linked to raw" means the lookups match and the tab should show numbers once Sheets recalculates. A WARNING saying none of the cells match a raw row means Setup changed after the dashboard was built: run **PTG → Build PTG tab**, then **Run now**. A WARNING that a cell shows "-" although raw has a number means the formulas are not resolving in this spreadsheet; rebuild the PTG tab, and if it persists check File → Settings → Locale and tell us.

## Numbers are all 0 but the run said ok

Read the run summary (alert, or the `ok` line in the log). If "responses by users not in any group" is most of the rows, `van_users` on Setup doesn't match what's in the canvasser column. Unhide the import tab (View → Hidden sheets), look at a few values in that column, and copy the format VAN uses (username vs. full name vs. ID) into `van_users`.

If the survey row count itself is 0 or tiny, re-check the list criteria in VAN, and that the dates fall inside the program window.

## Shifts are 0 or low

Event names must start with one of the group's `event_prefixes`. Check for a space or different punctuation at the start of the event name in VAN. Also confirm the signups are marked `Completed`, not `Scheduled` or `Confirmed`, and that the export's date range covers the weeks you expect.

## "… with unreadable dates"

Some rows have a date the sheet can't parse. It reads `10/7/2026`, `10/7/2026 2:03:00 PM`, `2026-10-07`, and dates Sheets converted on File → Import. Anything else (e.g. `Oct 7`) is skipped. Change the date format in VAN's export options, or import via File → Import, which converts most formats to real dates.

## "File is too large for the dialog"

The upload dialog handles roughly 20 MB of text. For bigger files, use File → Import onto the import tab, or trim the export to the columns the sheet needs.

## A week header, group code or metric key was edited by hand and now shows `-`

The PTG tab looks up `raw` by exact week label, group code and metric key. Run **PTG → Build PTG tab** to regenerate the layout from Setup; goals are kept.

## I rebuilt the PTG tab and lost goals

Goals are preserved by `week label + group code + metric key`. If you renamed a group code or metric key on Setup, the old goals no longer match and are dropped. Check the version history (File → Version history) to copy them back.

## Authorization popup says the app isn't verified

Normal for any Apps Script you or your organization wrote. Click *Advanced → Go to PTG (unsafe)*. The only permission requested is to edit this spreadsheet.
