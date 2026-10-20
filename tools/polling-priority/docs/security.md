# Security notes

## What data is involved

- **No voter-level data.** The Sheet holds per-location sums (expected ballots, expected supporters) and wait-time reports. The optional `feeders/aggregate.mjs` reads a voter file on your laptop and writes only those sums.
- **Wait-time reports** name a polling place, a wait, and a time. Nothing about the observer.
- The 2026 NH sheet exports are not part of this repo and should not be committed to it. The `.gitignore` files keep `.env`, browser profiles and logs out of git; keep CSVs out too.

## The web app and token

The Sheet exposes one URL (the web app) that accepts GET and POST. Every request must carry a 64-character random token stored in the Sheet's script properties (not in a cell). With the token, a caller can read the Setup config and write wait-time rows; without it, every request is refused. The token cannot read or change the locations or Priority tabs.

Keep the token with the runner only. If it leaks, **Polling Priority → Set up runner access** mints a new one and the old one stops working.

The deployment runs *as you* (the person who deployed) with access *Anyone*. "Anyone" means anyone with the URL can send a request; the token is what gates them. It does not expose the Sheet's contents.

## The runner and LBJ

The runner drives a real Chrome window with a **persistent profile** in `runner/profile/`. You sign into LBJ in that window with your own LBJ account; the session cookies live in that folder so you don't sign in every scrape. Consequences:

- Whoever can read `runner/profile/` on that laptop has your LBJ session until it expires. Use a laptop with disk encryption and a login password, and `npm run service -- uninstall` plus delete `profile/` when the cycle ends.
- The runner only ever opens `/dashboard/recent_line_lengths` and clicks *Next*. It does not touch issues, users, or assignments. The code that runs inside the page is the five short functions at the top of `runner/src/lbj.mjs`.
- LBJ's terms are the DNC's; running a read-only scraper of a dashboard you're entitled to view is what NH did in 2026, but check with your state party's voter protection director if unsure. A dedicated observer-level LBJ account for the runner is the cautious choice.

`runner/.env` holds the web app URL and token in plain text, mode 600. `logs/` holds what the scraper did, including location names and waits, nothing more.

## Apps Script scopes

`appsscript.json` requests `spreadsheets.currentonly` (this sheet only), `script.scriptapp` (to install the minute trigger) and `script.container.ui` (the menu and dialogs). It cannot read your Drive, your other sheets, or your email.
