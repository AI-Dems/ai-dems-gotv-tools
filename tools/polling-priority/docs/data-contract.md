# Data contract: the `locations` tab

Everything in this tool derives from one tab, `locations`: one row per polling location with the sums of two voter scores. Fill it any way you like (the built-in feeders, your own SQL, a paste) and the Priority and Line Reports tabs work. No voter-level data ever enters the Sheet; the numbers are sums.

## Columns

Header row is row 1. Columns are read **by header name**, so order does not matter and extra columns are allowed. Names are case-insensitive; spaces and underscores are interchangeable (`Likely Voters` = `likely_voters`).

| Column | Required | Type | Example | Notes |
|---|---|---|---|---|
| `location_name` | yes | text | `Pinkerton Academy` | The polling place as voters and poll observers call it. Must be unique together with `city`. |
| `city` | recommended | text | `Derry` | The town the location sits in. Used to match wait-time reports (LBJ names a place "Name (Town, County)"). |
| `likely_voters` | yes | number | `6710.4` | Σ turnout score over every registered voter assigned here. Expected ballots cast. |
| `likely_supporters` | yes | number | `2991.7` | Σ (turnout × support) over the same voters. Expected votes for your candidate. |
| `registered` | no | integer | `14102` | Registered voters assigned here. Shown for context only. |
| `precincts` | no | text | `Derry Ward 1, Derry Ward 2` | Comma-separated. Shown on both output tabs; a `- Ward N` suffix in a wait-time report is matched against it. |
| `address` | no | text | `5 Pinkerton St` | Shown on Priority. |
| `county` | no | text | `Rockingham` | Shown on Priority. |
| *anything else* | no | any | `Congressional District` | Every other column is carried through to the Priority and Line Reports tabs unchanged, in the order it appears here. Use this for districts, turf, regional organizer, etc. |

Rows with an empty `location_name` are skipped. A location that appears twice with the same `location_name` + `city` is an error (the Sheet tells you which).

## The two scores

For each registered voter, you need:

- **t**, a turnout score: the chance they cast a ballot, 0–1 (or 0–100; the tool only cares about sums, but use the same scale for both).
- **p**, a support score: the chance they vote for your candidate *if they vote*, 0–1.

Then per location, `likely_voters = Σ t` and `likely_supporters = Σ p·t`. Any model works: a DNC/DSCC/DCCC turnout and candidate-support model, a state party model, or a VAN score pair. If you have no candidate support model, a Dem partisanship score is a reasonable stand-in for p.

If your scores are 0–100, divide by 100 before summing, or the Net Vote Gain scale is off by 100 (ranks and tiers are unaffected).

## Ways to fill the tab

**From a data warehouse.** `feeders/bigquery.sql` and `feeders/redshift.sql` are templates: edit the `voters` CTE at the top to point at your voter file and score tables, run it, export the result, and paste it over `locations` (header included). Run `Polling Priority → Recompute priority` afterwards.

**From a voter-file export, without a warehouse.** Export a CSV from VAN, Phoenix, or your vendor with one row per voter and columns for polling location, city, precinct, turnout score and support score. On your laptop:

```bash
node feeders/aggregate.mjs voters.csv > locations.csv
```

It sums per location and writes the `locations` layout. Only the aggregate CSV leaves your laptop. The script auto-detects common column names and tells you which it used; override with flags (`--turnout`, `--support`, `--location`, `--city`, `--precinct`). See `feeders/aggregate.mjs --help`.

**By hand.** If you already have the sums, type or paste them.

## What the tool computes from it

| Measure | Formula |
|---|---|
| Net Vote Gain | `2 × likely_supporters − likely_voters` |
| Rank | Competition rank by Net Vote Gain, highest first |
| Tiers (1–5) | Natural breaks on each measure, or the cutoffs you type on `Setup` |

Details and the reasoning are in [metrics.md](metrics.md).

## What the Line Reports tab adds

Wait-time reports arrive through the web app (see [the runner](../runner/) for LBJ) as `{title | name + city, wait, time}` per location and are matched to `locations` rows by `location_name` + `city`, with manual fixes on the `Aliases` tab. The matching rules are in [troubleshooting.md](troubleshooting.md#a-location-is-unmatched).

Payload the web app accepts (`POST`, JSON, `Content-Type: text/plain`):

```json
{
  "token": "…",
  "action": "lines",
  "scrapedAt": "2026-11-03T21:15:05Z",
  "reportDate": "2026-11-03",
  "locationsSeen": 305,
  "rows": [
    { "title": "Pinkerton Academy (Derry, Rockingham)", "sourceId": "1126670", "wait": "1 Hour", "time": "4:41 PM" },
    { "name": "Town Hall", "city": "Bow", "wait": "No Line", "time": "4:40 PM" }
  ]
}
```

Each row needs either `title` in the LBJ form `Name (Town, County)` or `name` + `city`, plus `wait` (free text; the known values sort longest-first) and `time` (`h:mm AM/PM` or `HH:mm`, in the Sheet's timezone). Every push should carry the **full** set of locations the source currently shows; the live tab is re-rendered from scratch each time, and a row without a report shows blank.

Response: `{ ok, rows, matched, unmatched: ["title", …], unknownWaits: [...], snapshots: ["4:15 Report", …] }`.

`GET ?token=…&action=config` returns `{ ok, config: { timezone, electionDate, everyMin, lbjElectionName } }`; `GET ?token=…&action=ping` returns `{ ok, sheet }`.
