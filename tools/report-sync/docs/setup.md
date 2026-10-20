# Setup guide

Written for the person on the campaign who will own the sheet. No coding involved. Five minutes.

## 1. Copy the template

[Open the master template](https://docs.google.com/spreadsheets/d/1fm6r9-3MtDFQXcwP0zu-gONGzFQm_PdPNPI5xr_YqfA/copy) and choose **File → Make a copy**. Name it something like `[2026] Live VAN Reports`. Put it in a shared drive the data team can see, so it survives staff turnover.

## 2. Build the sheet

A **Report Sync** menu appears to the right of **Help** a few seconds after the sheet opens. If it doesn't, reload the page.

Choose **Report Sync → Build sheet (first time)**. Google shows an authorization screen the first time any menu item runs; it asks for two permissions: to edit this spreadsheet, and to show dialogs and sidebars. Both are needed. If you see "Google hasn't verified this app", click *Advanced → Go to Report Sync (unsafe)*: the warning appears for every personal Apps Script project and means only that Google hasn't reviewed it.

You now have **README**, **Setup** and **log** tabs.

## 3. List your reports (optional)

The **Reports** table on `Setup` is a list of the reports you keep in this sheet. It fills the tab dropdown in the upload dialog. You can skip it and type tab names at upload time; the sheet remembers which tab each report went to by its column headers.

| Column | What to enter |
|---|---|
| database | `My Campaign` or `My Voters` (dropdown). Informational unless you use the automatic runner. |
| report_name | The saved template's name in Report Manager. Informational unless you use the automatic runner. |
| tab | The tab the report lands in. Created on first upload. Short lowercase names like `shifts_today` are easiest to reference in formulas. |
| enabled | Only matters for the automatic runner. |

The **Settings** and **Status** blocks further down are for the automatic runner; ignore them.

## 4. Upload a report

1. In Votebuilder, open the saved report in Report Manager and choose **Export As → Excel (.xls)**. When the "Export in Progress" dialog closes, go to **My Export Files** and download the `.zip`.
2. In the sheet, **Report Sync → Upload export…**. Drop the zip onto the dialog, or click it to browse. The `.xls` or `.csv` inside the zip works too.
3. Pick the tab. After the first upload of a report, the dialog pre-selects the tab it went to last time ("same columns as last time").
4. **Import.** The dialog reports rows and columns written. Row 1 of the tab is the report's header.

The tab is replaced from A1 down. Rows and columns beyond the new data are cleared, never deleted, so a `=QUERY(shifts_today!A:Z, …)` on another tab keeps working. Column order is whatever the report produces; reference columns by header (`MATCH`, `INDEX`, `QUERY`) rather than by letter in case someone changes the report.

## Day to day

- The `log` tab has one row per upload: when, which file, which tab, how many rows.
- To add a report, upload it and pick **New tab…**.
- To stop keeping a report, just stop uploading it. Delete its tab if you like; nothing else references it.
- If someone changed the report's columns in Votebuilder, the dialog won't recognise it and won't suggest a tab. Pick the tab by hand; it will remember the new shape from then on.

Want the tabs refreshed automatically every 30 minutes? See [runner.md](runner.md). When something breaks: [troubleshooting.md](troubleshooting.md).
