# Progress to Goals (PTG) tracker

A Google Sheet that turns VAN exports into each organizer's or turf's weekly numbers against the goals you type in. Field directors use it to see who is on pace and where to move resources.

```
┌──────────────────────────── Progress to Goals ─────────────────────────────┐
│                  │ Shifts Completed  │ Canvass Shifts   │ Volunteer Signups │
│                  │  #   Goal   PTG   │  #   Goal  PTG   │  #   Goal   PTG   │
│ Oct 5 - 11       │                   │                  │                   │
│   TOTAL          │ 25    30    83% ▇ │ 22    25   88% ▇ │ 12    20    60% ▅ │
│   Jane Doe       │  9    10    90% ▇ │  9    10   90% ▇ │  3     8    38% ▃ │
│   Campus team    │ 16    20    80% ▆ │ 13    15   87% ▇ │  9    12    75% ▆ │
│   Unassigned     │  0                │  0               │  0                │
│ Oct 12 - 18      │  …                                                       │
└────────────────────────────────────────────────────────────────────────────┘
```

Originally built by the 2026 New Hampshire coordinated campaign on top of DSCC data warehouse tables. This version needs nothing but VAN exports and a Google account: no API key, no warehouse, no servers. A standard committee VAN login is enough; see *What the tool expects from VAN* below for the one place that varies by committee.

## What it tracks

Each column on the dashboard counts what happened **that week**, per row (an organizer, a team or a turf), with no running totals. You pick what a column counts from a dropdown:

| What to count (dropdown) | Counts | Fed by |
|---|---|---|
| Completed shifts | Event signups marked `Completed`, in the week of the event. Optionally only one event type (`Canvass`, `Phone Bank`, `One on One`…), so each kind of shift can have its own column | Event Participant Report |
| Scheduled shifts (commitments) | Every commitment due that week: scheduled, confirmed, completed or no-show. With No-shows this gives the flake rate | Event Participant Report |
| No-shows | Signups marked `No Show`. Lower is better: the yellow cell is a maximum and the column turns red past it | Event Participant Report |
| People who completed a shift | Distinct people with a completed shift that week | Event Participant Report |
| New volunteers (first completed shift) | People whose first completed shift in the loaded data is that week | Event Participant Report |
| People who first answered a survey question | Each person once, in the week of their first answer to the question you name, whatever the answer | Survey Response Report |
| People whose current answer is… | People whose latest answer to the question you name is the answer you name (`Yes`, `4 - Confirmed`, several, or `*` for any) | Survey Response Report |

**Who gets credit.** A shift goes to the person in VAN's `Recruited By` if they are listed on Setup, else to the volunteer's own `DCCC Organizer` when the export has that column, else to the row whose event-name prefix matches, else to a row marked `*`. A survey response goes to the person in `Canvassed By`, else to the `*` row. Whatever nobody claims lands on an **Unassigned** row that still counts in the total, so the total is always everything in the file. Events whose name starts with `[Cancelled]` are skipped. The run summary says how many shifts went each way and how many past shifts are still not marked Completed in VAN.

## What you type, what you get

Setup has four blocks. Two of them are tables you fill in; every header has a hover note. Here is a complete example for a campaign with two organizers and a catch-all row.

**Groups** (one dashboard row each):

| Name on dashboard | Their name in VAN | Or events starting with |
|---|---|---|
| Jane Doe | Doe, Jane; | |
| Pat Smith | Smith, Pat; | |
| Everyone else | | * |

**Metrics** (one dashboard column each):

| Column on dashboard | What to count | Only these event types | Which survey question | Which answer counts |
|---|---|---|---|---|
| Shifts Completed | Completed shifts | | | |
| Canvass Shifts | Completed shifts | Canvass | | |
| Shifts Scheduled | Scheduled shifts (commitments) | | | |
| No Shows | No-shows | | | |
| Volunteer Signups | People who first answered a survey question | | SQ26 DCCC VOL | |
| Said Yes | People whose current answer is… | | SQ26 DCCC VOL | Yes |

That produces a dashboard with six column blocks and, in every week, a TOTAL row, Jane Doe, Pat Smith, Everyone else, and Unassigned. Shifts Jane recruited count for Jane; shifts recruited by anyone else count for Everyone else; volunteer asks Jane entered in VAN count for Jane. You type goals into the yellow cells.

Three kinds of cell, and that is all there is to know:

| Kind | Cells | Where the text comes from |
|---|---|---|
| **You make it up** | Name on dashboard, Column on dashboard, titles | Anything you like |
| **Pick from a dropdown** | What to count | The seven rules above |
| **Must match your export** | Their name in VAN, Or events starting with, Only these event types, Which survey question, Which answer counts | Values that appear in the VAN file; after your first import, these cells offer the values found in your data |

Grey rows that start with **Example** show what entries look like and are ignored. Change Setup later and the next **Run now** rebuilds the dashboard to match, keeping goals and imported data.

## What the tool expects from VAN

| Export | Feeds | Where in VAN (MyCampaign) | Standard login? |
|---|---|---|---|
| **Event Participant Report** | all shift columns | any list → Reports → Event Participant Report → Export As… → Excel. The default columns are enough | Yes |
| **Survey Response Report** | survey columns | any list → Reports → Survey Response Report, Date Canvassed = program start to today (30 days max per pull), Edit Columns → Select All → Export As… → Excel | Viewing yes; the Export button depends on the committee. Without it, copy the table from the page and paste it into the import dialog, one page at a time; rows add up and duplicates are skipped |

Both go in through **PTG → Import VAN export…**. Shifts replace the previous import; survey rows accumulate (deduplicated by Survey Response ID). Exact clicks, with what to do when something looks wrong, in [docs/setup.md](docs/setup.md).

## Setup in 15 minutes

You need a Google account and a standard VAN login on the committee's MyCampaign database.

1. **Copy the template Sheet:** [See the template here](https://docs.google.com/spreadsheets/d/1zmDQAOTEtH2GJMykTuoPsZX8d3YKbP8UMgxyZkP_TIM/copy)→ File → Make a copy.
2. Open the copy. A **PTG** menu appears next to Help after a few seconds (reload if not). Run **PTG → Build sheet (first time)** and authorize when asked; the script only touches this sheet.
3. Fill in the **Setup** tab: dates, one row per organizer or team, and one row per dashboard column, picking *What to count* from a dropdown. Every header has a hover note; the **README: Start here** tab in the sheet walks through all six steps.
4. **PTG → Build PTG tab.** Type goals into the yellow cells.
5. Export from VAN: the Event Participant Report (shifts) and, if you track survey metrics, the Survey Response Report. Exact clicks in [docs/setup.md](docs/setup.md).
6. **PTG → Import VAN export…** for each file (or paste copied rows), then **Run now** (button in the dialog, or the PTG menu). Numbers appear.

Daily from then on: export, import, run. About five minutes. When something breaks: [docs/troubleshooting.md](docs/troubleshooting.md).

## How it works

```
VAN exports ──(PTG → Import)──▶ hidden import tabs ──(PTG → Run now)──▶ raw tab ──(formulas)──▶ PTG tab
```

Apps Script code bound to the Sheet reads the two imported exports, counts per week × group × metric, and writes one row per combination to a hidden `raw` tab. The PTG tab is plain formulas looking up `raw`. Goals are typed by hand and survive rebuilds. Imported VAN data stays on hidden tabs so you can re-run after changing Setup; **PTG → Clear imported VAN data** removes it.

Because `raw` has a fixed, documented shape ([docs/data-contract.md](docs/data-contract.md)), a campaign with a data warehouse can skip the imports and feed `raw` from BigQuery, Civis, or Portal instead: set **Raw tab is fed from outside** to Yes on Setup, and Run now only checks that the dashboard reads it. A single column can also be marked *Fed from outside* while the rest come from VAN exports.

## Repo contents

```
apps-script/      the code inside the Sheet (push with clasp; tests run in Node)
  Config.js       reads the Setup tab
  Import.js       upload dialog, import tabs
  Upload.html     the upload dialog
  Metrics.js      pure counting logic, unit-tested end to end
  Sheet.js        builds the PTG tab and writes raw + log
  Main.js         menu and the run
docs/             setup (with the field map), metric definitions, data contract, troubleshooting
test/             Node tests for the pure parts (npm test)
```

## Maintaining the template

Maintainers push code to the master template Sheet with [clasp](https://github.com/google/clasp) (`cp .clasp.json.example .clasp.json`, fill in the script ID, `npm run push`). Campaign copies get the code at copy time, so **push to the template after every merge** or new copies ship the old code. To ship a fix to an existing copy, open its Apps Script editor and paste the updated files (and `appsscript.json` when the permission list changed: Project Settings → show the manifest). Run `npm test` before pushing.
