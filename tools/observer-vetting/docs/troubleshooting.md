# Troubleshooting

Check the `log` tab first: every run writes one line, and failed FEC lookups say who and why. `Setup → Status` shows whether a run is still going.

## The Sheet

**No "Observer Vetting" menu.** Reload. If still missing, Extensions → Apps Script and look for a red error banner: a half-pasted file. Re-paste from the repo.

**"The observers tab needs a column named first_name."** Row 1 must contain `first_name` and `last_name` (spaces or capitals are fine). Other columns are optional.

**"Home state on Setup must be a two-letter state."** Fill in `Setup → Home state`.

**"No FEC API key yet."** Run **Set FEC API key**. Keys are per script, so a copy of the Sheet needs its own.

**"A run is already in progress."** A continuation is running in the background. Wait a minute, or **Stop run**.

## Lookups

**Everyone is Pending and nothing changes.** The continuation trigger did not fire or failed. Check `log` for an error; **Check setup** says whether a run is in progress. Run **Vet observers** again: it resumes.

**"FEC returned HTTP 429."** Rate limit. The tool already waits and retries; if it keeps happening, another tool or person is using the same key. Raise `Setup → Seconds between FEC requests` to 5.

**"FEC returned HTTP 403" / "Is the API key right?"** The key is wrong or revoked. Set it again.

**"Three FEC lookups in a row failed; stopping."** The FEC API is down or the network is blocked. Try again later; completed lookups are kept.

**The run stops after about four minutes with an error about execution time.** A single person took longer than expected (rate-limit retries). Just run **Vet observers** again.

**It is taking a long time.** About 8 seconds per out-of-state person, in four-minute chunks with a minute between. 200 people ≈ 25 minutes. That is the FEC's rate limit, not the Sheet.

## Results

**A known Democrat shows "No history".** Their FEC records may be under a different first name (add a row to `Nicknames`), a maiden name, or an address in another state (FEC lookups use the pasted state). Open **FEC Link** and search by hand. Small donors under $200 per cycle are often not itemized at all.

**A Review says "FEC first name differs".** The records at that address are under another first name: likely a spouse or parent. Decide by hand and type initials in Vetted.

**Someone shows as "In state, no voter file match" but is on our voter file.** Their voter-file columns are blank. Fill in `voter_file_party` and/or `support_score` (or `voter_file_match` = Yes) and re-run.

**A Flag looks wrong.** Open **FEC Link**. Common names matched only by zip (Match says *Medium*) are weak evidence; the Flag only fires on a *Strong (street)* match or a zip match with no street to compare.

**Vetted initials disappeared.** The person's key changed: you added or changed the `id` column, or changed their name or zip without an id. Keep ids stable once you start vetting.

**Zip codes lost their leading zero in the export.** The tool restores zeros on 3- and 4-digit zips. For the Vetting tab, the column is text, so they stay.
