# Troubleshooting

## The page

Where to look first: the **Checks** chip under the title, and the Checks section near the bottom, which lists one line per thing it noticed.

**`This looks like a voter list (names or VAN IDs), not a count report.`** — The file has columns such as VANID, name or address. Export from **Counts** (a precinct-by-score crosstab), not from a list export.

**`This is a real Excel workbook (.xlsx).`** — The file was opened and saved in Excel, which converts VAN's text export into a workbook. Drop the original download, or save as CSV.

**`The first column header should be "Precinct".`** — Column 1 on the Counts page was not Precinct. Set Column 1 = Precinct, Refresh Results, export again.

**`Could not find the score band labels (like "0 to 9.99").`** — Crosstab 1 was not a score, or the export is not a crosstab. Set Crosstab 1 = your support score.

**`The columns do not line up with the score bands.`** — More than one crosstab or column was set. Use exactly one crosstab (the score) and one column (Precinct).

**`The score bands differ between the returned and registered files.`** — A different score was picked for one of the pulls. Re-pull with the same Crosstab 1 on every file.

**`The registered total moved N% since the last registered pull.`** — Usually a different suppression setting on the new pull; sometimes a real registration-deadline jump. Re-pull with the same setting on every search ([van-searches.md](van-searches.md)).

**`More returned ballots than registered voters.`** / **`N precinct-and-band combination(s) had more returned than registered voters and were counted as zero left.`** — Returned exceeds registered somewhere. A different suppression setting, or a registered file older than the returned file. Re-pull the registered pair with the same setting.

**`"Returned, regular voters" is larger than "Returned".`** (or the registered pair) — The regulars search has fewer filters than the all-voters search, or a different suppression setting. The regulars search must be the all-voters search plus the vote-history filter.

**`N precinct(s) in the returned file are not in the registered file.`** — Precinct names differ between the two pulls, which should not happen when both come from the same VAN. Usually one pull is from a different committee or an old file. Re-pull both.

**`All score bands fall into one bucket.`** — The cutoffs under Score groups do not match this score's bands. Pick a preset again or set each bucket's lowest band.

**`These score bands could not be read as numbers and are counted as "No score": …`** — A column heading the page does not understand (for example `Less than 10`). It is kept separately, not bucketed. Tell us the label; the page can learn it.

**`N precinct name(s) appeared twice and were added together.`** — Informational: VAN lists some precincts under two counties. Use a groups file to label them if it matters.

**`The precinct rows add up to N but VAN's Total People says M.`** — The file is not a plain one-crosstab table, or rows were lost in a copy. Export again.

**`No "data as of" date. Set it in the Data section.`** — Set it. It comes from the returned file's modification date when the browser provides one.

**Every precinct shows 0 left, or the returned total equals the registered total.** — The export counted everyone in the committee, not your search: **People from** on the Counts page was left on *Registered Voters*. Set it to **My List**, Refresh Results, export again. The automatic runner checks for exactly this and refuses the file.

**The page is empty after I open it on another computer.** — The page remembers data per browser, per computer. Use **Download workspace** on the first computer and **Load workspace** on the second, or set up the automatic `data.js` so every copy reads the same file.

**My dropped files vanished and the banner says "loaded automatically".** — A `data.js` sits next to the page and reloads on every open, by design. Remove it, or load your files on a copy of the page in another folder.

**The numbers differ from my own spreadsheet.** — Check the basis (*Counting: regular voters* vs *all registered*), the suppression setting on each pull, and whether your spreadsheet counts "chase" with the same buckets. [metrics.md](metrics.md) has every definition.

## The automatic runner

Everything below applies only if you set up the optional runner ([automation.md](automation.md)).

Where to look first: `runner/logs/voters.log`. A slot that fails ends with `FAILED: <reason>`, usually `where it stopped: …`, and always a `What to do:` line. `data.js` is left as it was, so the page keeps showing the previous pull rather than a wrong one. The slots that passed stay in `exports/`, so only the failed one needs re-running:

```
npm start -- --headed --only returned --then-make-data
```

Every export is checked before it is saved: it must be a precinct-by-score crosstab, its score cells must add up to its row totals (VAN sometimes exports a table whose cells are still computing; the runner refreshes and tries once more), and its "Total People" total must equal the "My List (N People)" count VoteBuilder showed after running the search. A file that fails any of these is not saved. `logs/voters.last-success.txt` records the last run that saved every slot, and `npm run service -- status` shows it.

### Setup-time messages

**`Set VB_EMAIL and VB_PASSWORD in .env`** — Run `npm run setup`.

**`No searches.json`** / **`searches.json has no entry for "…"`** — Run `npm run setup`, which writes it, or fill in the four names by hand following `searches.example.json`.

**`The voters export is already running (PID …)`** — A previous run is still going. Wait, or `npm stop`. A lock left by a killed run or from before a reboot is recognised as stale and ignored.

**`node: bad option: --env-file-if-exists`** — Node is older than 22.9. Install the current LTS from nodejs.org.

### VoteBuilder messages

**`not starting: a previous run found that VoteBuilder needs a fresh sign-in`** — The saved sign-in lapsed (about 30 days), or the password changed. Scheduled runs stop at once and do not touch VoteBuilder until you run one visible pass: `npm run check`, sign in, type the code, leave "Remember this device" ticked. A saved export clears the marker. If the password changed, `npm run setup` first.

**`ActionID rejected the login: …`** — Wrong email or password. `npm run setup`.

**`ActionID is asking for a one-time code. Run once with --headed`** — Two-step sign-in needs a person once. `npm run check`.

**`no saved search named "…" in any of the N folder(s) this login can see`** — The name in `searches.json` does not match a saved search this login can open. Check the Open Saved Search dialog in VoteBuilder; fix the name there or with `npm run setup`.

**`the Open Saved Search dialog did not appear within 30 seconds`** — VoteBuilder was slow. Nothing wrong was saved. Run it again. If it repeats, open the search by hand once to confirm the dialog works for this login.

**`the saved search "…" was chosen but did not load into the search editor within 45 seconds`** — Same: VoteBuilder was slow, and the runner did not click Run Search (that would have counted everyone). Run it again.

**`the export counts N people but the saved search has M`** — If N is the whole committee, the "People from" dropdown stayed on *Registered Voters*; run with `--headed` and watch it. If N and M are close, the search was still running when the count was read; run it again.

**`VoteBuilder's crosstab was incomplete twice: the score cells add up to N people but the row totals say M`** — VAN handed back a count table whose score cells had not finished computing (the row totals were right, the cells short). The runner refreshes and exports once more on its own; this message means it happened twice. Nothing wrong was saved. Run again in a few minutes; if it recurs at the same time every day, schedule a quieter hour (`npm run service -- install --at 07:30`).

**`could not read the "My List (N People)" count`** — The sidebar count the check relies on was not readable. Run with `--headed`, note what the left sidebar shows under *My List*, and send that with the screenshot in `failures/`.

**`the export has no "Total People" row`** / **`not a precinct crosstab`** / **`looks like a voter list`** — The file VoteBuilder returned is not a precinct-by-score crosstab. Run with `--headed` and check Crosstab 1 and Column 1 before Export To Excel.

**`"Crosstab 1" still shows "…" after choosing "…"`** — The score name in `searches.json` is not spelled the way the picker lists it (the runner needs the exact name; `…Support v2` is not `…Support`). Open the picker by hand, copy the name, `npm run setup`.

**`could not find "…" on the page`** — A button the runner looks for is not there, so your VoteBuilder is laid out differently. Run with `--headed`, then send the last 30 lines of `logs/voters.log`, the `.png` in `failures/`, and the name of the button you would click. The fix goes in the `NAV` table at the top of the Counts section in `runner/src/votebuilder.mjs`: each step is an ordered list of ways to find a control by its text; add the real label to the front.

**`the browser closed unexpectedly`** — Chromium crashed; the runner relaunches it and retries that slot once. If it happens on every run: `npx playwright install chromium`.

**`Votebuilder asked which committee to open`** — The login belongs to several committees and VoteBuilder has no default. Open VoteBuilder by hand once and choose the committee; ask the VAN administrator to make it the default.

**`data.js was not written: …`** — The exports are saved; only the conversion failed, and the message says why (most often an existing `data.js` that could not be read: rename or delete it and run `npm run export:all` again).

### It just stopped

- **`npm run service -- status` says the last successful run was days ago.** The laptop was off or asleep at the scheduled time, or the sign-in lapsed (the status line says `NEEDS SIGN-IN`). `npm run check` restores either.
- **The service log (`logs/voters.service.log`) is empty on a Mac.** The agent did not load; `npm run service -- install` again, and make sure the laptop is logged in at the scheduled time (launchd user agents run only while you are logged in).
- **On Windows the task shows "Ready" but never ran.** Task Scheduler needs the user logged in; set the laptop not to sleep and leave the session open, or change the task to run whether the user is logged on or not (it will ask for the Windows password).

### When VoteBuilder changes

Every control the runner clicks is named by its visible text in `NAV` in `runner/src/votebuilder.mjs`; the sign-in form's selectors are in `LOGIN` in `runner/src/login.mjs`. When a visible pass stalls on a page, the screenshot in `failures/` shows what the runner saw. Open an issue in the repo with the log lines and the screenshot (look at it first: it is your VoteBuilder window) so the fix reaches every campaign.

Before sharing anything from `failures/` or `logs/`: the screenshot is a page from your VoteBuilder session, and the log names your searches and their counts. Nothing in either is a voter record, but look first.
