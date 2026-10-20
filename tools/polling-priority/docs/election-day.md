# Election day runbook

For the person running the laptop and the voter protection / field leads reading the Sheet.

## Before polls open

- [ ] Laptop plugged in, lid open, sleep disabled (Mac: System Settings → Lock Screen → never; Windows: Power → Never sleep when plugged in).
- [ ] In `runner/`: `npm start` (or confirm `npm run service -- status` says running). Sign into LBJ in its window if it asks.
- [ ] LBJ's top-left dropdown is on today's election, and its dashboard Date filter is today.
- [ ] On the Sheet, `Line Reports` → *Last scrape* (top right) is green and updating. `Setup → Status` shows today's date.
- [ ] `Setup` → *Election date* is today and *Snapshot times* are what you want. **Polling Priority → Check setup** is clean.
- [ ] Poll observers know how to report line length in LBJ (their check-in flow). No reports in LBJ means nothing to show here.

## During the day

**Reading `Line Reports`.** Sorted longest line first, then by priority rank. So: start at the top; the first Tier 1–2 rows with a real wait are where to send people. *Time Reported* green = under an hour old; yellow = 1–2 h; red = older, call the observer. A blank wait means no observer has reported from there today.

**How many to send** is a judgment call for voter protection, not the sheet. The sheet tells you where it matters.

**Snapshots.** At each snapshot time a tab like `4:15 Report` appears, frozen. Work there, not on the live tab: mark *Wait Time Accurate?* (Yes/No), tick *Volunteers Deployed*, add *Notes*. The live tab keeps changing; the snapshot is the record of what you knew and did at that hour. A snapshot tab colored red means no scrape arrived in the 10 minutes after the time and it froze the last data it had.

**Unmatched locations.** `Setup → Status → Unmatched locations` lists LBJ places the tool couldn't tie to a row. Paste the exact text into `Aliases` column A, type the `location_name` and `city` from `locations` in B and C. Fixed on the next scrape (≤ 5 min).

## The laptop talks

The runner speaks (on a Mac) and prints `[ALERT]` lines when it needs a person. Each kind nags at most every 10 minutes.

| It says | Do |
|---|---|
| dashboard is not loading — sign in | Click into its Chrome window and sign in to LBJ. |
| LBJ is switched to "…" | Change the election in LBJ's top-left dropdown. |
| filtered to <date>, not today | Fix the Date filter on the dashboard page in its window. |
| location(s) match nothing | Add them on the `Aliases` tab. |
| page N never loaded / scrape failed | Usually a slow LBJ; it retries in 5 minutes. If it persists, restart: Ctrl-C then `npm start`. |
| unfamiliar wait value | LBJ added a new option. It still shows on the sheet (sorted above "No Line"); tell the maintainer. |

**Runner dead?** *Last scrape* on the sheet turns red after 12 minutes without a push. On the laptop: Ctrl-C, `npm start`. The sheet keeps the last good data meanwhile.

**No LBJ at all?** You can still post reports from another source (a form, a script) using the payload in [data-contract.md](data-contract.md); or type waits by hand into a snapshot tab and keep working from that.

## After polls close

- `npm stop` (or `npm run service -- uninstall`) on the laptop.
- The snapshot tabs are your record. Leave them.
- Note anything that went wrong in the `log` tab or an issue on GitHub so next cycle's campaign doesn't hit it.
