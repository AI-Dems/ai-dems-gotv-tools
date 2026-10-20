# Setup, step by step

## 1. Copy the template

Open the master template (link in the README) → File → Make a copy. Put it in a shared drive only the voter protection team can see; it will hold volunteers' personal details.

## 2. Build the tabs

After a few seconds an **Observer Vetting** menu appears next to Help. If it does not, reload the page. Run **Observer Vetting → Build sheet (first time)**. Google asks you to authorize the script: it needs to edit this spreadsheet, create the redacted copy, call the FEC website, and schedule itself to keep running. Choose your account, then *Advanced → Go to Observer Vetting (unsafe)* if Google shows its unverified-app screen (the code is open source; nothing leaves the Sheet except FEC queries by name and state).

Tabs created: `README`, `Setup`, `observers` (sample rows), `Nicknames`, `Committees`, `prior_observers`, `log`.

## 3. Setup tab

| Setting | What to put |
|---|---|
| Home state | Your state's two-letter code. Required. |
| Support score threshold | 0.5 unless your data team says otherwise. Scores are 0–1. |
| Democratic party labels | How your voter file spells a Democratic registration. The defaults cover VAN's "Democratic" and the FEC's "DEM"; add "Democrat" or "DFL" style labels as needed. |
| Search FEC gifts since (year) | 2016 by default. Earlier gifts are ignored. |
| Seconds between FEC requests | 3.7 keeps a free key under its hourly limit. Leave it. |

Hover a setting's label for a note. The **Status** area on the right (columns D/E) is written by the tool: progress, last run, results.

## 4. FEC API key

Get a free key at <https://api.open.fec.gov/developers/>: enter an email address and it arrives within a minute. Then **Observer Vetting → Set FEC API key** and paste it. The tool makes one test request and tells you if the key works. The key is stored with the script, not in any cell, so it does not travel with copies of the Sheet.

## 5. Paste your observers

Replace the sample rows on `observers` with your list. [data-contract.md](data-contract.md) says what each column is and how to export from VAN. Keep row 1 as headers; the tool reads columns by name.

Optional: paste past cycles' observers into `prior_observers` (first and last name) for the **Served Before** column.

## 6. Check, then run

**Observer Vetting → Check setup** reports what it sees: how many people take each path, how many FEC lookups are needed, and anything that would stop a run. Then **Observer Vetting → Vet observers**.

The first run looks up as many people as fit in about four minutes, writes the Vetting tab with the rest marked **Pending**, and schedules itself to continue a minute later. Leave the Sheet open or closed; it does not matter. `Setup → Status` shows `FEC lookups: 80 of 200 done; continues automatically`. When it says `done`, every row has a status. **Stop run** halts the continuation; **Vet observers** picks up where it left off.

## Re-running

Run **Vet observers** again whenever the list changes. People already looked up come from the cache, so only new names cost time. Initials in **Vetted** stay with their person (by `id` if you pasted one, else by name + zip).

To force fresh FEC data for everyone, for instance after a new filing deadline, **Observer Vetting → Clear FEC cache** and run again.

## Sharing outside the team

**Observer Vetting → Make shareable copy (redacted)** creates a new spreadsheet in your Drive with only the Vetting rows, and names, IDs, addresses, emails, phones and FEC links replaced by `[REDACTED]`. Status, Path, state, party, score, totals and notes are kept.
