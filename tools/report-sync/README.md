# Votebuilder Report Sync

A Google Sheet that turns Votebuilder report exports into tabs you can build dashboards on. Download a saved report from Votebuilder, drop the file into the Sheet, and its tab is replaced top to bottom while your formulas, charts and formatting stay put.

```
Votebuilder Report Manager ──(Export As → download)──▶ Report Sync → Upload export… ──▶ one tab per report ──(your formulas)──▶ dashboards
```

Originally built by the 2026 New Hampshire coordinated campaign as a scheduled scraper. This version makes the everyday path a manual upload that needs nothing but the Sheet, and keeps the scheduled version as an optional add-on for campaigns that want it.

## Why not just File → Import?

You can, and for a one-off that's fine. Report Sync exists for reports you refresh several times a day:

- It reads Votebuilder's export format directly: the `.zip` from My Export Files, or the `.xls` inside it, which is tab-separated text, not a workbook, and trips up Import.
- It replaces the tab without deleting rows or columns, so formulas on other tabs that point at it keep working. Import's "Replace current sheet" does not promise that.
- It remembers which tab each report belongs to by its column headers, so the second upload is two clicks.
- It logs every upload (who, when, how many rows) on a `log` tab.

## Setup in 5 minutes

You need a Google account. That's it.

1. **Copy the template Sheet:** [See template here](https://docs.google.com/spreadsheets/d/1fm6r9-3MtDFQXcwP0zu-gONGzFQm_PdPNPI5xr_YqfA/copy) → File → Make a copy.
2. A **Report Sync** menu appears next to Help after a few seconds (reload if not). Run **Report Sync → Build sheet (first time)** and approve the authorization prompt. It asks for two permissions (edit this spreadsheet, and show dialogs and sidebars); both are needed.
3. Optional: list your reports in the **Reports** table on `Setup`. It fills the tab dropdown in the upload dialog; you can also type a new tab name at upload time.

## Updating a report

1. In Votebuilder, open the saved report in Report Manager, **Export As → Excel (.xls)**, then download the `.zip` from **My Export Files**.
2. In the Sheet, **Report Sync → Upload export…**. Drop the zip (or the `.xls`/`.csv` inside it). Pick the tab, or accept the suggestion. **Import.**
3. The tab is replaced; the `log` tab gets a row.

Export as Excel rather than CSV: Votebuilder's CSV leaves some "Last, First" name fields unquoted, which shifts those rows a column to the right. Both formats are accepted.

## Advanced: automatic sync

Campaigns that want the tabs refreshed every 30 minutes without anyone clicking can run the **runner**, a small program on a laptop that logs into Votebuilder with a dedicated account, exports each report listed on `Setup`, and uploads it through the same code path. It needs a Votebuilder account, a laptop that stays on, and about 15 more minutes of setup. Two-step sign-in works (you enter the code once in a visible run and the laptop stays trusted for about 30 days), but an account without it is smoother: nothing to redo when the trust expires. See [docs/runner.md](docs/runner.md) and read [docs/security.md](docs/security.md) first.

## Repo contents

```
apps-script/      the code inside the Sheet (push with clasp; tests run in Node)
  Import.js       reads a Votebuilder export (zip / xls / csv) into rows
  Upload.html     the upload dialog
  Sheet.js        replaces tabs without deleting rows/cols, writes log, builds Setup/README
  Config.js       reads the Setup tab
  Main.js         the Report Sync menu
  Api.js          web app endpoint used only by the optional runner
runner/           optional: Node 22 + Playwright scheduled exporter (docs/runner.md)
docs/             setup, troubleshooting, runner, data contract, security
```

## Maintaining the template

Maintainers push `apps-script/` to the master template Sheet with [clasp](https://github.com/google/clasp) (`cp .clasp.json.example .clasp.json`, fill in the script ID, `npm run push`). Campaign copies get the code at copy time; to ship a fix to an existing copy, paste the updated files into its Apps Script editor. Run `npm test` in `apps-script/` (and `runner/` if you touched it) before opening a pull request.
