# Data contract

The pieces other things can depend on: the files the page accepts, the groups file, the workspace file, the `data.js` feed, and the page's small script API. Add to these; don't rename or reorder.

## Count files

One file per slot (`returned`, `returned_regulars`, `registered`, `registered_regulars`). VAN's **Export To Excel** from Counts and Crosstabs, or a CSV/TSV with the same layout.

| File | How it's read |
|---|---|
| `.xls` from VAN | UTF-16LE HTML with a BOM: an HTML `<table>` despite the extension. A real binary workbook (`.xlsx`, or an `.xls` re-saved by Excel) is refused with a message. |
| `.csv` / `.txt` | UTF-8 (BOM optional), comma or tab, quoted fields allowed. |

Layout, top to bottom:

1. A header row whose first cell starts with `Precinct`. It may carry `Total People` as its last cell.
2. A row of score-band labels. Each label the page uses must begin with a number: `0 to 9.99`, `10 to 19.99`, `90+`. `Unknown` (VAN's unscored band) is recognised by name. Cells labelled `%` or `Percent` are skipped. Blank leading cells (VAN puts one under `Precinct`) are skipped. Any other label is kept as a column and reported under Checks as unrecognised; it never silently joins a bucket.
3. One row per precinct: the precinct name in the first cell, then a count per band in the band columns (percent columns ignored), then `Total People`.
4. A `Total People` row at the bottom. Its total is kept as `vanTotalPeople` and compared with the sum of the rows.

Rules: a precinct name that appears twice is summed and listed under Checks; rows that do not line up with the band columns fail the file if they are more than half of it; a file with a header but no precinct rows is a valid file of zeros (early voting before any ballot has come back); a file whose first rows contain `VANID`, `First Name`, `Last Name`, `Address`, `Phone`, `Email` or `Cell` is refused as a voter list.

The precinct name is the only key. Both files come from the same VAN, so names match exactly; the page does no matching.

## Groups file (crosswalk)

A CSV with a header row. One column must be called `precinct` (any case) and hold VAN's exact precinct names. Every other named column becomes a filter: `county`, `turf`, `organizer`, `region`, `goal_area`, anything. Blank cells mean "no group". Precincts not in the file are shown under "(no group)". The page's **Download template** writes this file pre-filled with the precinct names it has.

## Workspace file

**Download workspace** writes `vote-chase-workspace-<date>.json`. **Load workspace** reads it, and so does the automatic feed below. Shape (version 1):

```json
{
  "version": 1,
  "asof": "2026-10-16",
  "asofFrom": "2026-10-16",
  "electionDay": "2026-11-03",
  "files": {
    "returned":            {"name": "returned.xls", "bands": ["0 to 9.99", "...", "90+", "Unknown"], "rows": {"County - Town - 001": [1, 31, 9, 12, 20, 14, 10, 32, 60, 55, 0]}, "vanTotalPeople": 51328, "duplicates": [], "unmatched": [], "fileDate": "2026-10-16"},
    "returned_regulars":   {"...": "same shape"},
    "registered":          {"...": "same shape"},
    "registered_regulars": {"...": "same shape"}
  },
  "crosswalk": {"columns": ["county", "turf"], "rows": {"County - Town - 001": ["County", "Turf A"]}},
  "history": {"2026-10-15": {"returned": 43843, "returned_regulars": 43000, "registered": 642089, "registered_regulars": 434378}},
  "buckets": [{"name": "Strong D", "low": 80, "color": "#174ea6", "chase": true}, "..."],
  "noScoreChase": false,
  "preset": "5",
  "basis": "regular",
  "sort": "chase",
  "top": "15",
  "breakdown": false
}
```

`files.*.rows` is `{precinctName: [count per band, in bands order]}`. `returned` and `registered` are required; the other two are optional. Everything from `buckets` down is optional and keeps the page's current setting when absent. Unknown keys are ignored; a malformed file is refused with a message, never partially applied.

## Automatic feed: `data.js`

A file named `data.js` next to `index.html`, containing one statement:

```js
window.VOTECHASE_DATA = { ...the workspace object above, "source": "data" };
```

The page loads it on open (from a file, a shared drive, or any web server) and shows a banner with its `asof` date. Files dropped by hand on a page that has a `data.js` are replaced by it on the next open. A `data.json` with the same object also works, but only when the page is served over http(s). Keep voter-level files out of the folder the page lives in.

The runner's converter (`runner/src/makedata.mjs`, `npm run make-data`) writes this file from the four VAN exports, carrying `history` and the settings keys from the previous `data.js`. Anything else that can write the same object can feed the page: a warehouse job, a cron on a server, a Google Apps Script.

## Script API

The page exposes `window.VoteChase` for tests and for anyone embedding it:

| Member | What it does |
|---|---|
| `parseCountReport(text)` | Decoded file text → `{bands, rows, vanTotalPeople, duplicates, unmatched}`; throws with a user-facing message on refusal. |
| `parseCrosswalk(text)` | Groups CSV text → `{columns, rows}`. |
| `normalizeFile(obj)` | Fills defaults on a parsed file. |
| `setFile(slot, parsed)` | Loads a parsed file into a slot, records history, saves, renders. |
| `compute()` | The current model: `{rows: [{name, chase, left: [per bucket], totalLeft, share, groups}], ...}` for the current filter and basis. |
| `state()` | The live state object (files, buckets, settings). Mutate, then `render()`. |
| `render()` | Redraws. |

## Browser storage

One key, `votechase.v1`, in `localStorage`, holding the workspace object. Nothing else is stored and nothing is sent anywhere. **Reset page** removes the key, session storage, caches and IndexedDB for the page's origin, then reloads with `?reset=`.
