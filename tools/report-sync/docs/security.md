# Security and risk

Read this before setting the tool up. It's short, and the decisions in it are yours to make, not the tool's.

## Manual uploads

The everyday path (Report Sync → Upload export…) is an Apps Script bound to your sheet. It asks for permission to edit that sheet only. It makes no network calls, stores no credentials, and sends nothing anywhere: the export you drop in is parsed in Google's Apps Script runtime and written to a tab. Whatever is in the report ends up in the sheet, so treat the sheet like any VAN export: restrict sharing, and prefer aggregate reports over voter-level ones where an aggregate will do.

Everything below applies only to the optional automatic runner ([runner.md](runner.md)).

## What the runner does that you should know about

**It drives Votebuilder with a headless browser.** VAN has no API for saved reports, so the runner clicks through Report Manager the way a person would, one report at a time. It makes no effort to disguise itself: it uses Playwright's stock Chromium, takes no artificial pauses, and runs on an exact schedule. NGP VAN can see that it is automation if they look, and their terms of use govern automated access to their site. Your campaign is responsible for deciding whether this use is acceptable under your contract; ask your VAN administrator or committee staff if unsure.

**It signs in as a real Votebuilder account, and keeps that session on the laptop.** With two-step sign-in on, you enter the one-time code once during a visible run and the runner ticks "Remember this device"; the browser profile in `runner/profiles/` then stays trusted for about 30 days, after which the background runner logs that it needs a code and you run `npm run check` again. Because the laptop holds a trusted session:

- Use a **dedicated account** for the runner, not a staffer's. Name it clearly (e.g. `reportsync-campaign`) so audit logs make sense.
- Give it the **narrowest access that still sees the reports**: the one committee, the one database, read-only where VAN allows it, and no export of voter lists beyond what the reports need.
- Use a long, unique password. It's stored on the laptop in `runner/.env`.
- **Delete the account after the election.**

**Voter data lands on the laptop.** Each export is unzipped into `runner/downloads/` and the tab content is sent to Google. Exports are deleted after one day, and failure screenshots may show voter rows. So:

- The laptop should have full-disk encryption on (FileVault on Mac, BitLocker on Windows) and a login password.
- Treat the Sheet like any VAN export: restrict sharing, and don't put voter-level reports in it if an aggregate report will do. The tool doesn't know or care what the report contains.

## What guards the Sheet from the runner

The Sheet's web app is deployed with access "Anyone" because the runner isn't signed into Google. Every request must carry the sync token, a 64-character random value stored in the script's properties (not in a cell, so it doesn't travel with copies or exports of the sheet). Requests without it are refused. The web app can only do what `Api.js` exposes: read Setup, replace a report tab, append to the log, update status. It can't read other tabs or share the sheet.

If the token leaks, run **Report Sync → Advanced → Set up runner access** to generate a new one and update the runner with `npm run setup`.

## Where secrets live

| Secret | Where | Not in |
|---|---|---|
| Votebuilder passwords | `runner/.env` on the laptop (file mode 600) | git, the Sheet, logs |
| Sync token | Script properties of the Sheet; `runner/.env` | cells, logs |
| Votebuilder session cookies | `runner/profiles/<account>/` | git |

`runner/.gitignore` excludes all of these. Don't commit a runner folder from a laptop that has been set up.

## What the tool does not do

- Neither the sheet nor the runner sends anything to AI Dems or any third party. The only network destinations are `votebuilder.com`, `id.ngpvan.com` and the Google script URL of your own Sheet.
- It doesn't store VAN API keys (it doesn't use the API).
- It doesn't modify anything in Votebuilder except creating exports, which VAN lists under My Export Files like any manual export.
