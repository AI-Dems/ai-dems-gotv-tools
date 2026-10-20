# Poll Observer Vetting

A Google Sheet that checks a list of volunteer poll observers for signs they are not on our side, so the voter protection team knows who to look at more closely before assigning them. Paste the list in, click **Vet observers**, and each person comes back **Pass**, **Review** or **Flag** with a note saying why.

```
        observers tab                                   Vetting tab
 ┌────────────────────────────────┐          ┌──────────────────────────────────────────────┐
 │ first  last   state zip  party │          │ Vetted Status  Path          Dem $ Rep $ Notes│
 │ Maria  Lopez  NH   03301 Dem   │  ──▶     │        Pass    Voter file                     │
 │ Janet  Okafor VT   05401       │          │        Pass    Out of state   $60         FEC…│
 │ Dale   Krebs  ME   04101       │          │        Flag    Out of state        $125   FEC…│
 │ …                              │          │ SG     Review  In state, no…              Man…│
 └────────────────────────────────┘          └──────────────────────────────────────────────┘
   you paste (VAN export, CSV)                 computed; you type initials in Vetted
```

| Who | Pass if |
|---|---|
| On your voter file (you pasted party and/or support score) | Registered with a Democratic party label, **or** support score above the threshold on `Setup` |
| Everyone else | Gave only to Democratic committees per public FEC records, matched on name plus street (or zip if no street was pasted) |

Anything short of that is **Review**, with the reason in Notes. **Flag** means evidence against: not a Democrat on the voter file, or a Republican-only donor with a confident identity match. [docs/statuses.md](docs/statuses.md) has every rule.

Originally built by the 2026 New Hampshire coordinated campaign as a Python script against the DSCC warehouse. This version runs entirely inside the Sheet: no Python, no warehouse, no command line. The vetting rules are unchanged (the test suite checks every rule against the original's output).

## What you need

- A Google account.
- A free FEC API key from <https://api.open.fec.gov/developers/> (enter an email; the key arrives in a minute).
- Your observer list with names and, ideally, street, city, state and zip. For people on your voter file, their party and support score if you have one, exported from VAN or your warehouse. [docs/data-contract.md](docs/data-contract.md) lists the columns.

## Setup in 15 minutes

1. **Copy the template Sheet:** [See template here](https://docs.google.com/spreadsheets/d/1S18EKRFyi4NsfnZhwTt4CQwBqWGX8tQcFTs67RJrOvI/copy) → File → Make a copy.
2. An **Observer Vetting** menu appears next to Help after a few seconds (reload if not). Run **Observer Vetting → Build sheet (first time)** and approve the authorization prompt. It creates `Setup`, `observers` (with sample rows), `Nicknames`, `Committees` and `prior_observers`.
3. On `Setup`, set **Home state**. The other settings have sensible defaults.
4. **Observer Vetting → Set FEC API key.** Paste your key. It is stored with the script, not in a cell.
5. Paste your observers over the sample rows on `observers`. Optionally paste past cycles' observers into `prior_observers`.
6. **Observer Vetting → Check setup**, fix anything it lists, then **Observer Vetting → Vet observers**.

FEC lookups take about 8 seconds per person who is not on your voter file. A list of 200 people takes 20–30 minutes; the Sheet keeps going on its own after the first click, `Setup → Status` shows progress, and rows still waiting say **Pending**. People already looked up are never fetched twice, so re-running after adding names is quick.

More detail: [docs/setup.md](docs/setup.md). When something breaks: [docs/troubleshooting.md](docs/troubleshooting.md).

## Using the Vetting tab

- Work the **Review** and **Flag** rows. **Notes** says what to check; **FEC Link** opens the public FEC search for that name so you can see the records yourself.
- Type your initials in **Vetted** when you have looked at a row. They survive re-runs.
- Re-run **Vet observers** whenever `observers` changes. Only new people are looked up.
- **Make shareable copy (redacted)** writes a new spreadsheet with names, IDs, addresses, emails and phones replaced by `[REDACTED]`, for anyone outside the voter protection team.

## About the data in this Sheet

Unlike the other tools in this repo, this one holds personal information about volunteers: names, addresses, contact details and donation history. Share the Sheet only with the voter protection team, use the redacted copy for anyone else, and delete the Sheet after the election. The FEC data is public; the voter-file party and score columns are not, and come under whatever agreement covers your VAN or warehouse access.

## Repo contents

```
apps-script/      the code inside the Sheet (push with clasp; pure logic tested in Node)
  Names.js        name and street matching, nickname groups
  Fec.js          party of a committee, summarizing a person's FEC records
  Vet.js          the Pass / Review / Flag rules and the Vetting rows
  Config.js       reads Setup, observers, Nicknames, Committees, prior_observers
  Api.js          the FEC API and the key
  Job.js          the resumable run and the FEC cache
  Sheet.js        the tabs, status, log, redacted copy
  Main.js         the menu
  test/           npm test: rule tests, a parity test against the original NH script, and an end-to-end smoke test
docs/             setup, data contract, statuses, troubleshooting, maintainer handoff
```
