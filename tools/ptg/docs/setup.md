# Setup guide

Written for the person on the campaign who will own the sheet. No coding involved. Budget 15 minutes for setup and 5 minutes a day after that.

## Before you start

- A Google account (campaign Workspace account preferred, so the sheet survives staff turnover).
- A VAN login on the committee's **MyCampaign** database that can create lists, export them, and view event participation. Export rights are a VAN permission; ask your VAN admin if the Export button is missing.

## How the pieces fit (read this once)

Every cell on Setup is one of three kinds. Knowing which is which answers most "why is this zero" questions. The sheet itself says this too: the **README: Start here** tab walks through the six steps, and every Setup header has a hover note.

| Kind | What it means | Examples |
|---|---|---|
| **You make it up** | Any text you like; it only appears on the dashboard and in `raw` | Name on dashboard, Column on dashboard, Dashboard title, Total row label |
| **Must match a column header in your export** | The exact header text from the file VAN gave you, case ignored | the two *(advanced)* columns, every row of the Advanced block |
| **Must match a value inside VAN** | Text that appears in the cells of the export: an answer, a person's name or username, the start of an event name, an event type | Which answer counts (`4 - Confirmed`), Their name in VAN (`Jane Doe`), Or events starting with (`CMPA_`), Only these event types (`Canvass`) |

*What to count* is the fourth kind: a dropdown of the tool's seven counting rules. After your first import, the cells that must match a value offer the values found in your data as dropdowns.

What the tool does with them, in one breath: for each metric it reads the right export, keeps the rows that match the metric's rule, puts each row in a week by its date, credits it to a group (by the person who entered or recruited, else by the event name), and writes one count per week × group × metric to the hidden `raw` tab. The PTG tab looks those counts up next to the goals you typed. Extra columns in an export are ignored; names and phones in the file do no harm, but there is no reason to export them either.

**Two exports feed it:**

| Export | Feeds | Where in VAN | Works with a standard login? |
|---|---|---|---|
| **Event Participant Report** | every shift metric | any MyCampaign list → Reports → Event Participant Report | Yes. Default columns include everything needed |
| **Survey Response Report** | Signups, Confirmed Leaders and other survey metrics | any MyCampaign list → Reports → Survey Response Report | **Viewing: yes. Exporting: depends on your committee.** Many committees don't give the Export button on this report to standard users. Then either ask your VAN admin to enable it (a one-time setting) or copy the table from the page and paste it into the import dialog, one page at a time. The report covers at most 30 days per pull; the sheet keeps earlier imports, so weekly history survives |

## 1. Copy the template

Open the master template (link in the [README](../README.md)) and choose **File → Make a copy**. Name it something like `[2026] Campus PTG`. Keep it in a shared drive the field team can see.

## 2. Build the sheet

A **PTG** menu appears to the right of **Help** a few seconds after the sheet opens. If it doesn't, reload the page.

Choose **PTG → Build sheet (first time)**. Google will show an authorization screen the first time any menu item runs; it asks permission for the script to edit this spreadsheet and to show its own dialog (the import window), nothing else. Approve it. If you see "Google hasn't verified this app", click *Advanced → Go to PTG (unsafe)*: the warning appears for every personal Apps Script project and means only that Google hasn't reviewed it.

You now have **README: Start here**, **Setup** and **log** tabs. If the copy already had a Setup tab (templates sometimes do), Build sheet leaves it alone and says so; use **PTG → Reset Setup and README to sample values…** to replace it with the current sample values and the hover notes. Every column header on Setup has a note saying what goes in it, whether it can be blank, and whether it must match something in your export; the README tab lists every field on one line each.

## 3. Fill in Setup

For a complete worked example (a Groups table, a Metrics table, and the dashboard they produce), see *What you type, what you get* in the [README](../README.md).

The Setup tab has four blocks. Hover any bold label or column header for what goes in it, whether it can be blank, and whether it must match something in your export. Grey rows that start with **Example** show what entries look like; they are ignored, so overwrite or delete them.

**Settings**

| Field | What to enter |
|---|---|
| Campaign name | Anything; used in alerts |
| Program start date | First day that counts, `yyyy-mm-dd`. Snapped back to the start of that week. |
| Election day | Last day that counts. The final week runs through this day even if it's longer than 7 days. |
| Week starts on | `Monday` for most programs (dropdown) |
| Timezone | Only used for the "Last updated" stamp, e.g. `America/New_York` (dropdown) |
| Dashboard title | The big title on the PTG tab |
| Total row label | `TOTAL`, `DISTRICT`, `STATEWIDE`… |
| Unassigned row label | Label of the automatic last row in each week, which holds anything no group claimed. Default `Unassigned` |
| Ignore events starting with | Events to skip even if their signups say Completed. Default `[Cancelled]`; comma-separate several; `none` to count everything |
| Raw tab is fed from outside | `Yes` only if a data warehouse writes the hidden `raw` tab itself ([data-contract.md](data-contract.md)). Run now then only checks the dashboard. Default `No` |

**Groups** — one row per thing you compare: a person, a team or a turf. Each becomes a row in every week block, plus an automatic **Unassigned** row.

| Column | What to enter | Must match? |
|---|---|---|
| Name on dashboard | The row label people read: `Jane Doe`, `Campus team`, `Everyone else`. Required. | No, you make it up |
| Their name in VAN | The people whose work counts here, written as VAN writes them in `Recruited By` / `Canvassed By`: `Jane Doe`, or `Doe, Jane;` (end with a semicolon, or separate several people with semicolons), or usernames `jdoe, mlee`. Word order and case are ignored. After an import, the cell offers the names found. Optional. | Yes, values in the export |
| Or events starting with | Starts of event names (`CMPA_`) whose shifts count here when no listed person recruited them. `*` takes every shift nobody else claimed. Optional. | Yes, values in the export |
| Short code (optional) | A short key for formulas; made from the name when blank. | No |

Shifts are credited first by `Recruited By`, then by `Or events starting with`, then by the `*` group; whatever is left shows on the Unassigned row and still counts in the total. Exact rules in [metrics.md](metrics.md).

**Metrics** — one row per column block on the dashboard.

| Column | What to enter | Must match? |
|---|---|---|
| Column on dashboard | The column heading people read: `Shifts Completed`, `Said Yes`. Required. Goals are tied to this name, so renaming a column later loses its goals. | No, you make it up |
| What to count | Pick from the dropdown: *Completed shifts*, *Scheduled shifts (commitments)*, *No-shows*, *People who completed a shift*, *New volunteers (first completed shift)*, *People who first answered a survey question*, *People whose current answer is…*. Required. | Fixed menu (the tool's rules, not VAN values) |
| Which survey question | For the two survey choices: the question's name exactly as VAN shows it, e.g. `2026 Rivet Vol`. After an import the cell offers the questions found. Blank for shifts. | Yes, a value in the export |
| Which answer counts | For *People whose current answer is…*: the answer (`Yes`, `4 - Confirmed`), several separated by semicolons, or `*` for any answer. After an import the cell offers the answers found. | Yes, a value in the export |
| Only these event types | Shift choices only, optional: count only these Event Type values, several separated by commas or semicolons (`Canvass`, or `Phone Bank, Text Bank`). Blank = all. After an import the cell offers the types found. | Yes, values in the export |
| Short code (optional) | The key used in `raw` and the formulas; made from the column name when blank. Set it if you plan to rename columns (goals are tied to it) or if a warehouse writes `raw`. | No |
| Date column (advanced), Canvasser column (advanced) | Only for an older per-person list export (one row per person with a block of columns per question): the headers of that question's date and canvasser columns, and then *Which survey question* holds the header of its answer column. Blank for the Survey Response Report and for shifts. | Yes, headers in the export |

Close spellings in *What to count* (`shifts complete`, `no shows`, `active`) are understood, and the message names the row and column when something doesn't fit.

**Advanced** — leave blank. The sheet recognises VAN's usual headers (`VANID`, `Event Name`, `Event Date`, `Status`, `Shift Start Time`, `Recruited By`, `Event Type`, `Survey Question Name`, `Survey Response`, `Date Canvassed`, `Canvassed By`, `Survey Response ID`). Fill a row only if a run tells you a column is missing; after an import each cell offers the headers found in that export.

**Older Setup tabs** built before this layout, with headers `group_code`, `display_name`, `van_users`, `event_prefixes`, `metric_key`, `label`, `type`, `value_column`, `date_column`, `canvasser_column`, `response_name`, `event_type` and a `Columns` block, keep working unchanged. **PTG → Reset Setup and README to sample values…** switches a sheet to the new layout (copy your rows first).

## 4. Build the PTG tab and enter goals

**PTG → Build PTG tab.** The dashboard appears with one block per week and one row per group. Type goals into the yellow Goal cells; the total row adds them up.

Whenever you change Groups or Metrics on Setup, the next **Run now** rebuilds the dashboard to match and says so; **Build PTG tab** does the same by hand. Goals are read before the rebuild and written back afterwards, keyed by week + group + metric, so nothing is lost, and imported data is untouched. *No-shows* columns show a **Max** instead of a Goal and turn red past it.

## 5. Export from VAN

Two files. When VAN offers a format, pick **Excel**: VAN's "Excel" download is a `.xls` file that is really tab-delimited text, it has no `SEP=` line, and names like `Last, First` stay in one column. CSV works too (the importer skips the `SEP=` line), but VAN's CSV leaves commas inside names and addresses unquoted, which shifts columns on those rows. Real `.xlsx` workbooks go in via File → Import (below).

**Survey export** — VAN's **Survey Response Report**: one row per response, with the question's name, the answer, the date and who recorded it.

1. **Create a New List** of everyone who might count: *Survey Questions → [your signup question] → any response*. If you track a second question (leaders), add it with *or*. (The report will show every survey response these people gave in the window, including other questions; the sheet keeps only the questions your metrics name.)
2. **Reports → Survey Response Report.** Set **Date Canvassed** to your program start date through today (the report allows at most 30 days per pull; for a longer program, pull the older window once and the recent window daily). Click **Edit Columns → Select All** so `Survey Response`, `Survey Question Name`, `Canvassed By`, `Is Most Recent Response` and `Survey Response ID` are included.
3. **Export As… → Excel** if the button is there. If it isn't, your committee hasn't enabled exporting this report for your login. Ask the VAN admin (often at the state party) to turn it on; meanwhile, select the table on the page, copy, and paste it into **PTG → Import VAN export…** → *Import pasted rows*. The table shows 100 rows a page; paste each page. Repeated headers and duplicate rows are skipped, and rows add up across pastes.

On Setup, each survey metric's *Which survey question* is then the **question's name** exactly as VAN shows it (e.g. `2026 Rivet Vol`); leave the two advanced columns blank.

**Older per-person list export.** If your committee's list export does carry a date and canvasser column per question, the sheet still accepts it: *Which survey question*, *Date column (advanced)* and *Canvasser column (advanced)* are then the three column headers for that question. The sheet tells the two shapes apart by the presence of a question-name column.

**Shifts export** — one row per event signup.

1. Make a list of everyone with an event signup (*Create a New List → Events*, any status, your program's date range) and run it.
2. **Reports → Event Participant Report.** Set the event date range from program start through election day (so scheduled shifts are included).
3. The report's default columns are all the sheet needs (**VANID, Event Name, Event Date, Status, Shift Start Time, Event Type, Recruited By**); Select All only adds personal data. **Export As… → Excel** and download the file (CSV also works).

Extra columns are ignored, so VAN's default column set is fine. Names, phones, emails and addresses are never used, so leave them out when the export screen lets you; if it doesn't, nothing breaks. Reports default to a short column list; **Edit Columns → Select All** is the quick way to make sure the needed ones are there.

## 6. Import and run

**PTG → Import VAN export…**, choose a file, **Import**, or paste copied rows and click **Import pasted rows**. The dialog says which tab it filled and how many rows. The sheet tells the two apart by their headers: a file with an event-name column is the shifts export; anything else is the survey export. The shifts export **replaces** what was there (it covers the whole program each time). Survey rows **accumulate**: each import or paste adds rows and skips duplicates, so a 30-day report pulled weekly, or six pasted pages, build one archive. **PTG → Clear imported VAN data** starts over.

**How duplicates are recognized, and why your numbers are safe either way.** The dialog tells you which rule applied after every import:

| Rule | When | What it means |
|---|---|---|
| Survey Response ID | the `Survey Response ID` column is present (Edit Columns → Select All) | Exact: VAN gives each response record one ID, so a re-pasted page adds nothing |
| VANID + question + answer + date + canvasser | no ID column, but those five are present | The same response is recognized even if a later paste has extra columns or a different date format |
| every cell | neither of the above | Weak; the dialog says WARNING. Re-import with Select All |

A re-sent row with the same `Survey Response ID` **replaces** the stored one (the dialog counts it as "refreshed"), so a changed answer or most-recent flag is never stale. Both keys are remembered for every stored row, so a later paste without the ID column still recognizes them. Headers spelled differently between pastes (`Survey Question Name` vs `Survey Question`) land in the same column. A paste **without a header row** is read in the same column order as what is already loaded, so include the header when you can.

Even if a duplicate row did slip through, survey metrics count **people**, not rows: a person's first response is their earliest row and their current response is their latest, so repeated rows of the same response can't change the number. Shifts count one per person + event + date + shift, and the shifts tab is replaced on every import.

Excel (`.xlsx`) files: unhide and select the tab **VAN survey export** or **VAN shifts export** (View → Hidden sheets), then **File → Import → Upload → Replace current sheet**.

**PTG → Run now** (or the **Run now** button in the import dialog). You'll see a summary in short paragraphs, warnings first, for example:

> 81 rows written to raw.
>
> WARNING: no loaded responses are for the question(s) "2026 Volunteer Ask" (Volunteer Signups), so those columns show 0. Questions found in the survey import: 2026 Rivet Vol, SQ26 DCCC VOL… Check "Which survey question" on Setup.
>
> 207 survey response rows (Survey Response Report) covering 6 questions; 0 people whose canvasser is in no group (shown as Unassigned)
>
> 661 signup rows; 289 completed shifts; 101 credited by "recruited by"; 188 by the catch-all prefix; 27 ignored at events starting with "[Cancelled]"; 21 past shifts still Scheduled/Confirmed, not counted
>
> Dashboard: 81 of 81 cells for weeks that have started are linked to raw.

"Shown as Unassigned" is your cue to add a person to *Their name in VAN* or fix event names; "still Scheduled/Confirmed" is a cue for the field team to mark shifts Completed in VAN; a WARNING names the Setup cell to look at. The same text is saved on the **log** tab.

If the run reports a missing column, **PTG → Show imported columns** lists the exact headers; copy the right one into Setup and run again.

## Big files and the File → Import route

The import dialog takes files up to about 20 MB. Bigger exports (a Select-All export with 100+ columns, or a Contact History file with 100,000+ rows) go in another way: unhide the import tab (**View → Hidden sheets → VAN shifts export** or **VAN survey export**), then **File → Import → Upload**, choose the file, and pick **Replace current sheet**. Keep an eye on size: a Google Sheet holds 10 million cells in all, so a 194,000-row file with 111 columns will not fit, while the same rows with 15 columns will. Untick columns you don't need in VAN's Edit Columns before exporting. Contact History and Activist Codes reports are not read by the sheet yet; importing one is refused with a message.

## Daily routine

Export both files from VAN, import each, run. Five minutes. Numbers are recomputed from scratch every run, so late edits in VAN show up in the right week.

## Sharing

Share the sheet with the field team as *Viewer* or *Commenter* and with whoever enters goals and runs imports as *Editor*. The import tabs are hidden but any editor can unhide them, so keep the exports to the minimal columns above. **PTG → Clear imported VAN data** wipes them whenever you like; the PTG numbers stay.

## Updating the code later

Campaign copies carry a snapshot of the code from when they were copied. To get a fix, open **Extensions → Apps Script** in your copy and replace each file's contents with the matching file from `apps-script/` in this repo. Setup, goals and imports are untouched.
