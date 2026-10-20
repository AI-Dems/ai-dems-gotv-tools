# Troubleshooting

Check the `log` tab first: every run and every push writes one line, and failures say what went wrong.

## The Sheet

**No "Polling Priority" menu.** Reload. If still missing, Extensions → Apps Script and look for a red error banner: a half-pasted file. Re-paste from the repo.

**"The locations tab needs a column named …"** Row 1 must contain `location_name`, `likely_voters` and `likely_supporters` (spaces or capitals are fine). Other columns are optional.

**"… appears twice on the locations tab."** Two rows share a name and city. If they really are two places, give them a distinguishing name (`Middle School - Ward 1` / `- Ward 2`); if one place, merge the rows and add the sums.

**Tiers look wrong / every location is tier 3.** Automatic cutoffs come from natural breaks in your numbers; with very few locations or many identical values they can bunch. Type four cutoffs into `Setup` (see [metrics.md](metrics.md#tiers)) and recompute.

**Net vote gain is tiny for every location.** Your scores are probably 0–100, not 0–1; the sums are 100× too large for voters and 10,000× for supporters. Rebuild `locations` with scores divided by 100 (`aggregate.mjs --scale 100`). Ranks are unaffected, tiers and the raw numbers are.

**"The Line Reports tab's columns are out of date."** You added or removed a column on `locations`. Run **Build Line Reports tab**. Notes typed on the live tab are kept.

**Snapshot didn't happen.** Snapshots only fire on the `Setup` election date, in the spreadsheet's timezone, for times the trigger can read (`4:15 PM` or `16:15`, comma-separated). Check **Check setup**: it reports the date, the times and whether the trigger is installed. A time more than 60 minutes past when the trigger first sees it is skipped and listed under `Status → Missed snapshots`.

**A snapshot tab is red.** No push arrived within 10 minutes after the time, so it froze the last data. Its A1 note says when that was. The runner was probably down; see below.

**Time Reported colors don't change.** The colors depend on `NOW()` recalculating. **Build Line Reports tab** sets recalculation to every minute; File → Settings → Calculation shows it.

## Matching

<a name="a-location-is-unmatched"></a>
**A location is unmatched.** The tool tries, in order: an `Aliases` row with that exact text; the name + town after normalizing case, punctuation and a leading "Town of"/town name; the name alone if only one row has it; then with a trailing "- Ward N" stripped. If none hits, add an `Aliases` row: column A is the text exactly as `Status` shows it, B and C are the `location_name` and `city` from `locations`.

**A report landed on the wrong row.** Two rows have the same name and the town in the report matched neither, so the name-only rule picked the only one it knew. Add `city` values that match what LBJ shows, or an alias.

**Several precincts in one building show one report.** Intended: one building, one line. If LBJ reports them separately (`School - Ward 1`, `School - Ward 2`), make them separate rows on `locations`.

## The runner

**`npm run setup` says the Sheet doesn't answer / not JSON.** The web app isn't deployed, or was deployed with access *Only myself*. Redeploy (Deploy → Manage deployments → edit → access *Anyone*). After a code change you also need a new version there.

**"bad token".** Run **Polling Priority → Show runner access** and `npm run setup` again with the current token.

**Chrome window shows LBJ's login forever.** Sign in in that window. If LBJ logs you out mid-day the runner alerts and waits.

**"LBJ is switched to …"** Change the election in LBJ's top-left dropdown (or clear *LBJ election name* on Setup if the check is wrong).

**"filtered to <date>, not today"**. On the dashboard page in the runner's window, set the Date filter to today. The runner keeps scraping and pushing with the date it sees, which is why the sheet shows that date in `Status`.

**"page N never loaded after clicking Next".** LBJ was slow. Nothing was pushed (a partial list would blank real reports); the next scrape retries. If it happens every time, LBJ's pager changed; file an issue with a screenshot.

**"another runner is already going".** Two copies started. `npm stop`, then start one.

**Last scrape is red on the sheet.** The runner hasn't pushed in 12 minutes. On the laptop: is the terminal still running? Did the laptop sleep? Ctrl-C and `npm start`.

**Nothing on the dashboard.** No observer has reported line lengths in LBJ today. The runner is fine; the problem is upstream. Check your observers' check-in flow.

## Getting help

Open an issue at https://github.com/AI-Dems/ai-dems-gotv-tools/issues with the `log` tab line and the runner's `logs/` line that went wrong. Don't paste the token.
