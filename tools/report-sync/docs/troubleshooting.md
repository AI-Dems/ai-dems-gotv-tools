# Troubleshooting

## Uploading a report

**The Report Sync menu is missing.** Reload the sheet; it appears a few seconds after load. If it never does, Extensions → Apps Script should show the project; if that's empty, the copy didn't carry the script. Copy the template again.

**`Upload the .zip from My Export Files, or the .xls / .csv inside it.`** — The file isn't one of those. Export from Votebuilder with Export As → Excel (.xls) or CSV; don't open and re-save it in Excel first.

**`This is a binary Excel workbook.`** — The file was opened and saved in Excel, which converts it. Upload the original download.

**`Expected one .xls or .csv inside the zip, found N.`** — Not a Votebuilder export zip, or someone re-zipped a folder. Upload the file straight from My Export Files.

**`"log" is reserved; pick another tab.`** — Reports can't target `Setup`, `README` or `log`.

**Names look shifted a column to the right for some rows.** — The export was CSV and those rows have a "Last, First" field Votebuilder didn't quote. Export as Excel (.xls) instead.

**Numbers came in as text.** — Shouldn't happen (values are written as if typed). If a column is text, the report itself is sending it that way (leading apostrophe, zip codes with a dash); format the column in the sheet or adjust the report.

**The dialog hangs on "Importing…" for a long report.** — Very large exports (tens of thousands of rows) take Google a while. Give it two minutes before retrying; the `log` tab shows whether it landed.

**The dialog didn't suggest a tab.** — Either it's the first upload of this report, or the report's columns changed since last time. Pick the tab; it remembers from then on.

**Formulas elsewhere broke after an upload.** — The tab is replaced from A1; rows and columns are never deleted, but column *order* is the report's. If the report's columns changed, formulas pointing at letters shift. Reference headers with `MATCH`/`INDEX` or `QUERY` instead of fixed letters.

## The automatic runner

Everything below applies only if you set up the optional runner ([runner.md](runner.md)).

Where to look first: the `log` tab in the sheet (one row per report with a *Details* column), then `runner/logs/campaign.log` or `voters.log` on the laptop. A report that fails leaves a screenshot and the page HTML in `runner/failures/<account>/` for a day.

To see what the runner sees, run one visible pass: `npm run check` (My Campaign) or `npm start -- --account voters --once --headed`.

### Setup-time messages

**`SYNC_URL in .env must be the web app URL`** — The value isn't a `https://script.google.com/macros/s/…/exec` address (Google Workspace accounts get `https://script.google.com/a/<domain>/macros/s/…/exec`, which is also accepted). In the Apps Script editor, Deploy → Manage deployments, copy the *Web app URL* under Web app, not the sheet's link.

**`the Sheet did not answer "ping" with JSON`** — The URL reached Google but got a sign-in page or an error page instead of the script. Usually the web app was deployed with access *Only myself* or *Anyone with Google account*; redeploy with **Anyone**. Or the URL is the script's own test deployment rather than the one from Deploy → Manage deployments. Or there is no deployment yet (Part 1 of runner.md).

**`the Sheet refused "…": bad token`** — The token in `.env` doesn't match the sheet's. Someone probably ran *Set up runner access* again. Run `npm run setup` and paste the current token from *Advanced → Show runner access*.

**`the Sheet refused "…": no sync token set`** — Run Report Sync → Advanced → Set up runner access on the sheet.

**`Cannot read the Sheet's Setup tab: …`** — The message after the colon comes from Check Setup tab; fix the row it names.

**`Set VB_CAMPAIGN_EMAIL and VB_CAMPAIGN_PASSWORD in .env`** — That database wasn't set up. Run `npm run setup` and fill it in, or don't start that account.

**`The campaign sync is already running (PID …)`** — Two copies were started. If you installed the background service, you don't also run `npm start`. Use `npm stop` to end whichever one you don't want.

### Votebuilder messages

**`no saved report template named "…"`** — The name must match Report Manager exactly, apart from case and spacing. The report must be visible to the runner's account: saved by it, or shared with it. Log into Votebuilder as the runner account and check Report Manager → Saved Templates → All.

**`ActionID rejected the login: …`** — Wrong email or password for that account. Fix with `npm run setup`.

**`ActionID is asking for a one-time code`** — The saved session has expired (about 30 days) or this is the first run. Run `npm run check`, type the code in the browser window and click Continue; leave "Remember this device" ticked. **`no one-time code was entered within 5 minutes`** — Same, you just missed the window; run it again.

**`could not switch to My Voters` / `no "My Voters" tab`** — The account can't open that database. Check its access in Votebuilder.

**`Votebuilder asked which committee to open`** — The account belongs to more than one committee. The runner doesn't pick one; use an account that belongs to exactly one.

**`export did not show up on My Export Files within 10 min`** — Votebuilder is slow or the export failed on its side. Check My Export Files as the runner account. Large reports can take a while; try a narrower report.

**`the "Export in Progress" dialog never appeared`** — The report page changed, or the report has no Export As button (some report types can't be exported). Run a visible pass and watch.

**`timed out … waiting for Report Manager to load`** — Votebuilder was slow or down, or the laptop lost its connection. Passes retry on their own next slot. If it persists through a visible pass, the UI may have changed; see *When Votebuilder changes* below.

**`still on the ActionID login page after signing in`** — Login worked but Votebuilder sent the browser back to login. Occasionally a session problem; delete `runner/profiles/<account>/` to start with a clean browser profile and try again.

### Sheet messages

**`upload failed: …`** — The export downloaded but the sheet refused it. Look at the message. A common one is a Google timeout on a very large report (tens of thousands of rows); the next pass usually succeeds.


### It just stopped

- **`Runner last seen` on Setup is hours old.** The laptop is asleep, off, offline, or the service isn't running. `npm run service -- status` tells you. A lid closed on a MacBook usually means sleep.
- **`outside active hours; waiting`** in the log — Expected overnight. Check the timezone on Setup if it's waiting when it shouldn't.
- **`no enabled reports on Setup for this database; waiting`** — Every row for that database is `enabled = no`, or the rows list the other database.
- **The service log (`logs/<account>.service.log`) says the process keeps exiting** — Read the last lines; it's usually one of the setup messages above (bad `.env`). The service restarts it every 60 s until it works.

### When Votebuilder changes

Every selector the runner uses is in two places: `SEL` in `runner/src/votebuilder.mjs` and `LOGIN` in `runner/src/login.mjs`. When a visible pass stalls on a page, open the saved HTML in `runner/failures/` and find the new id or text. Open an issue in the repo with the failure files (strip any voter rows from the HTML first) so the fix reaches every campaign.
