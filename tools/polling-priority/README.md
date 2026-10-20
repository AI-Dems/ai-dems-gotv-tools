# Polling Location Priority + Line Tracker

A Google Sheet that ranks polling locations by estimated **net vote gain** (the votes we expect to gain on net if lines there get shorter) and, on election day, shows live wait times next to that ranking. Voter protection and field teams use it to send line-warming volunteers (water, chairs, reassurance) where long lines cost us the most.

```
          locations tab                       Priority tab                      Line Reports tab
 ┌──────────────────────────┐     ┌──────────────────────────────┐     ┌────────────────────────────────┐
 │ location   voters  supp. │ ──▶ │ Rank Tier  Net Vote Gain  …  │ ──▶ │ Wait   Rank Tier Location  …   │
 │ Pinkerton  6710    2992  │     │  1    1     +1,273  Riverside │     │ 3+ Hrs  1   1  Riverside  4:50 │
 │ Riverside  4120    2650  │     │  2    3        +70  Town Hall │     │ 1 Hour  7   5  Pinkerton  4:41 │
 │ …                        │     │  7    5      −727  Pinkerton  │     │ …       live from LBJ, 5 min   │
 └──────────────────────────┘     └──────────────────────────────┘     └────────────────────────────────┘
   you fill (SQL, CSV, paste)        computed; override by hand          runner on a laptop pushes reports
```

Originally built by the 2026 New Hampshire coordinated campaign on DSCC warehouse tables and the DNC's LBJ voter-protection system. This version has no campaign-specific values in the code: locations come from a tab you fill, every setting lives on `Setup`, and wait times can come from LBJ or from anything that can POST a short JSON message.

## Why net vote gain, not voter count

The old way ranked locations by how many likely voters they had. That directs help to the biggest sites, not necessarily the most impactful. It may even be the case that shortening *those* lines costs us votes. Net vote gain counts each expected voter as +1 if they're ours and −1 if they're likely not, so a big Republican-leaning site ranks last and a mid-sized Democratic one ranks first. [docs/metrics.md](docs/metrics.md) has the math and the tiers.

## What you need

- A Google account.
- For each polling location, two sums over the registered voters assigned there: **expected ballots** (Σ turnout score) and **expected votes for us** (Σ turnout × support score). Any turnout model and any support (or Dem partisanship) model works. [docs/data-contract.md](docs/data-contract.md) shows three ways to produce them: a SQL template for BigQuery or Redshift/Civis, a script that sums a voter-file CSV on your laptop, or a paste.
- To show live wait times: poll observers reporting line lengths into LBJ, and a laptop that stays on and logged into LBJ on election day. Without LBJ you still get the ranking, and wait times can be posted from any other source (see the data contract).

## Setup in 20 minutes

**On the Sheet**

1. **Copy the template Sheet:** [Find template here](https://docs.google.com/spreadsheets/d/1CKaG02PC3TxoDE-GjRxwFm3ZRH7tWy0Vq-SoCJ7hKHk/copy) → File → Make a copy.
2. A **Polling Priority** menu appears next to Help after a few seconds (reload if not). Run **Polling Priority → Build sheet (first time)** and approve the authorization prompt. It creates `Setup`, `locations` (with sample rows), `Aliases` and `log`.
3. On `Setup`, set your **timezone** and **election date**. Leave the tier cutoffs blank; the tool finds natural breaks in your data and shows the numbers it used.
4. Paste your polling locations over the sample rows on `locations`.
5. **Polling Priority → Recompute priority.** The `Priority` tab appears, ranked. Type 1–5 in the yellow **Tier Override** column to pin any location; overrides survive recomputes.
6. **Polling Priority → Build Line Reports tab.**

**For live wait times from LBJ**

7. Deploy the web app once: Extensions → Apps Script → **Deploy → New deployment** → type *Web app*, execute as *Me*, access *Anyone* → Deploy. (This is the door the runner knocks on; the token in the next step is the key.)
8. **Polling Priority → Set up runner access.** Keep the dialog open.
9. On the laptop: install [Node.js 22+](https://nodejs.org) (the "LTS" download, default options). Download this repo (green *Code* button → Download ZIP) and unzip it somewhere permanent. Then open a terminal in the `runner` folder: on a **Mac**, open Finder, go to `tools/polling-priority/runner`, right-click the `runner` folder → *New Terminal at Folder*; on **Windows**, open that folder in File Explorer, click in the address bar, type `cmd`, press Enter. In the window that opens, type `npm install`, press Enter, wait for it to finish, then `npm run setup` and Enter. Paste the URL and token when asked.
10. `npm run check` opens LBJ in a window. Sign in there once. It prints what it would send and sends nothing. Then `npm run once` for a real push; the `Line Reports` tab fills in.
11. Back on the Sheet: **Polling Priority → Install snapshot trigger**, then **Polling Priority → Check setup** until it says everything checks out.

Step-by-step with more detail: [docs/setup.md](docs/setup.md). Election day: [docs/election-day.md](docs/election-day.md). When something breaks: [docs/troubleshooting.md](docs/troubleshooting.md).

## Election day

- On the laptop, `npm start` (or install it as a background service, see setup). Every 5 minutes it reads LBJ's *Line Lengths by Hour* page and pushes every location's latest report.
- `Line Reports` re-sorts on every push: longest lines first, then by priority rank. The *Time Reported* cell is green under an hour old, yellow 1–2 h, red older. The *Last scrape* cell at the right turns red if the runner stops.
- At each **snapshot time** on `Setup`, a `4:15 Report`-style tab freezes the live view. Voter protection fills in *Wait Time Accurate?*, *Volunteers Deployed* and *Notes* there, so each hour's decisions are kept.
- `Setup → Status` lists any LBJ location the tool could not match to your `locations` rows. Add it to `Aliases` and the next push picks it up.

## Repo contents

```
apps-script/      the code inside the Sheet (push with clasp; pure logic tested in Node)
  Config.js       reads Setup, locations, Aliases
  Metrics.js      net vote gain, ranks, natural-break tiers      ← tested
  Match.js        matching a reported place to a locations row  ← tested
  Sheet.js        Priority tab, status, log, scaffolding
  Lines.js        Line Reports tab, snapshots, trigger
  Api.js          the web app (token-checked GET/POST)
  Main.js         menu
feeders/          ways to fill `locations`: bigquery.sql, redshift.sql, aggregate.mjs (voter CSV → sums, locally)
runner/           the LBJ line scraper for the laptop (Node + Playwright, `npm run setup`)
docs/             setup, metrics, data contract, election day, troubleshooting, security, dev handoff
```

## Maintaining the template

Maintainers push code to the master template Sheet with [clasp](https://github.com/google/clasp) (`cp .clasp.json.example .clasp.json`, fill in the script ID, `npm run push`). Campaign copies get the code at copy time; to ship a fix to an existing copy, open its Apps Script editor and paste the updated files. Run `npm test` in `apps-script/`, `runner/` and `feeders/` before pushing. [docs/dev-handoff.md](docs/dev-handoff.md) is the maintainer checklist.
