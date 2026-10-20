# Setup, step by step

Two halves. The first (the Sheet) takes about 20 minutes and gives you the ranking. The second (the runner) adds live wait times from LBJ and takes another 20 minutes on the laptop that will run it on election day. Do both at least a week before election day so there's time for a drill.

## Part 1: the Sheet

### 1. Copy the template

Open the template link from the README and choose **File → Make a copy**. Put it in your campaign's shared drive. Rename it (e.g. `[STATE 26] Polling Location Priority`).

### 2. Build the tabs

Reload the copy. After a few seconds a **Polling Priority** menu appears to the right of Help. Choose **Polling Priority → Build sheet (first time)**.

Google asks you to authorize the script. Click through *Advanced → Go to Polling Priority (unsafe)* → *Allow*. "Unsafe" only means Google hasn't reviewed it; the script can touch this sheet and nothing else. Run the menu item again after authorizing if nothing happened.

You now have `README`, `Setup`, `locations`, `Aliases` and `log`.

### 3. Fill in Setup

| Setting | What to type |
|---|---|
| Campaign name | Anything. Only a label. |
| Timezone | Where your polls are, as a tz name: `America/New_York`, `America/Chicago`, `America/Denver`, `America/Los_Angeles`, `America/Phoenix`… |
| Election date | `2026-11-03` or `Nov 3, 2026`, either works. Snapshot tabs are taken on this date only. For a drill, set it to today. |
| Support score describes | A label for what your support score measures (`Dem support`, `Smith for Senate support`). Shown in a column note. |
| Tier cutoffs (three rows) | Leave blank. See [metrics.md](metrics.md#tiers) when you want to freeze them. |
| Snapshot times | When to freeze a copy of Line Reports on election day, e.g. `4:15 PM, 5:15 PM, 6:15 PM, 7:15 PM`. Pick times a few minutes after the runner's scrape boundary (it scrapes at :00, :05, :10…) and after your voter protection check-in calls. |
| Scrape every (minutes) | `5` is right for LBJ. |
| LBJ election name | Optional. Part of the election's name as LBJ shows it in its top-left dropdown. The runner refuses to scrape if LBJ is switched to a different election (people switch it by accident). |

### 4. Fill in locations

Delete the sample rows (keep row 1) and paste your own. One row per polling place with at least `location_name`, `likely_voters`, `likely_supporters`; `city` and `precincts` make matching to LBJ reports much more reliable. [data-contract.md](data-contract.md) explains the columns and the three ways to produce them.

Tips:

- Name locations the way poll observers will see them in LBJ. LBJ shows `Name (Town, County)`; your `location_name` should match `Name` and `city` should match `Town`. Small differences (punctuation, "St." vs "Street", a leading town name) are handled; "Pinkerton Academy" vs "Hackler Gym at Pinkerton" is not, and goes on the Aliases tab.
- Several precincts voting in one building are one row, with the precincts comma-separated in `precincts`.
- Two rooms in one building that LBJ lists separately (`Middle School - Ward 1`, `Middle School - Ward 2`) are two rows.
- Any extra column (a district, a region, an organizer) is carried through to both output tabs.

### 5. Recompute priority

**Polling Priority → Recompute priority.** A `Priority` tab appears, ranked by Net Vote Gain. The alert tells you the tier cutoffs it chose. Look at the ranking with someone who knows the state; use the yellow **Tier Override** column for anything the numbers get wrong.

Run this again whenever `locations` changes. Overrides are kept.

### 6. Build Line Reports

**Polling Priority → Build Line Reports tab.** It lays out one row per location with the priority columns on the left and the report columns on the right, hides the three human columns (they're for the snapshot tabs), and sets the spreadsheet's timezone from `Setup`.

Run it again if you add columns to `locations`; the tool tells you when it's needed.

### 7. Snapshot trigger and check

**Polling Priority → Install snapshot trigger.** Then **Polling Priority → Check setup**. It lists anything left to do.

If wait times will not come from LBJ, stop here. The ranking is done. To post wait times from something else, see the payload in [data-contract.md](data-contract.md).

## Part 2: the runner (LBJ)

### What it is

A small program that opens LBJ in a Chrome window on a campaign laptop, reads the *Dashboard → Line Lengths by Hour* page every 5 minutes, and sends every location's latest report to the Sheet. It uses **your** LBJ login (you sign in once in its window; the session is kept in a folder next to the program). Read [security.md](security.md) first.

### 8. Deploy the web app (on the Sheet, once)

Extensions → Apps Script. In the editor: **Deploy → New deployment**. Click the gear next to *Select type* → *Web app*. Description anything; *Execute as* **Me**; *Who has access* **Anyone**. Deploy. Authorize if asked. Close the dialog; you don't need to copy the URL by hand.

### 9. Make the token

Back on the Sheet: **Polling Priority → Set up runner access**. A dialog shows the web app URL and a token. Leave it open.

### 10. Install on the laptop

1. Install [Node.js 22 or newer](https://nodejs.org): click the **LTS** download, run the installer with the default options.
2. Download this repository: on GitHub, green **Code** button → **Download ZIP**. Unzip it somewhere permanent (Documents, not Downloads). You get a folder like `ai-dems-gotv-tools-main`.
3. Open a terminal in the `runner` folder. A terminal is a window where you type commands; the ones below are the only ones you'll need.
   - **Mac:** in Finder, go to `ai-dems-gotv-tools-main → tools → polling-priority → runner`. Right-click the `runner` folder → **New Terminal at Folder**. (If that option is missing: open *Terminal* from Applications → Utilities, type `cd ` with a space, drag the `runner` folder into the window, press Enter.)
   - **Windows:** in File Explorer, open the same `runner` folder, click once in the address bar at the top, type `cmd`, press Enter.
   - You're in the right place if typing `dir` (Windows) or `ls` (Mac) and Enter lists `lines.mjs` and `package.json`.
4. Type `npm install` and press Enter. It downloads the scraper's dependencies; wait for the prompt to come back (about a minute).
5. Type `npm run setup` and press Enter. Paste the URL and token from the dialog when asked (right-click → Paste, or Cmd/Ctrl+V). Press Enter for the LBJ address unless yours is different. It installs Chromium (one-time, ~150 MB) and checks that the Sheet answers with a ✓.

Keep this terminal window; every later command (`npm run check`, `npm start`) is typed here. If you close it, reopen it the same way (step 3).

### 11. Sign in and test

- `npm run check` opens a Chrome window on LBJ's login page. Sign in there (Google, 2FA, whatever LBJ asks). Once the dashboard shows, the terminal prints what it would send. Nothing is sent. The sign-in sticks for next time.
- `npm run once` does one real push. Open the Sheet's `Line Reports` tab: *Last scrape* at the top right is green, and any location LBJ has a report for shows it. Before election day LBJ usually shows nothing, which is fine; see the drill below.
- `npm start` runs continuously. Ctrl-C stops it.

To keep it running in the background and after a restart: `npm run service -- install` (macOS and Windows; `npm run service -- uninstall` removes it). On Linux, run `npm start` inside `tmux` or write a systemd user unit that runs `node --env-file-if-exists=.env lines.mjs` in this folder with `Restart=always`.

### 12. Drill

A week before: on `Setup`, set *Election date* to today and *Snapshot times* to a time 5–10 minutes out. Run `npm run once` (or `npm run pick` to scrape a past election day from LBJ's date filter, which gives you real-looking data). Confirm:

- `Line Reports` fills and sorts.
- The snapshot tab appears at the time, with frozen colors and the three human columns visible.
- `Setup → Status` shows the scrape and lists any unmatched locations. Add those to `Aliases` and push again.

Then put the real election date and times back, delete the drill tab, and run **Check setup**. Any `… Report` tab left over from a drill is flagged.

## What ends up where

| Place | Holds |
|---|---|
| The Sheet | Location sums, ranks, tiers, wait-time reports, your notes. No voter-level data. |
| Script properties (inside the Sheet) | The runner token. Not in any cell. |
| The laptop, `runner/.env` | The web app URL and token. |
| The laptop, `runner/profile/` | Your LBJ browser session. |
| The laptop, `runner/logs/` | What the scraper did, one line per scrape. |
