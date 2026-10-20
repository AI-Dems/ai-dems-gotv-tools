# Security and risk

Read this before setting the tool up. It's short, and the decisions in it are yours to make, not the tool's.

## The page

**Nothing leaves your computer.** `index.html` is one file of plain HTML and JavaScript with no dependencies. It makes no network requests except two relative ones for an optional `data.js` or `data.json` sitting in its own folder; there is no analytics, no font or script from a CDN, no form that posts anywhere. The files you drop on it are read in your browser's memory. What the page keeps, it keeps in the browser's local storage on that computer, under one key, and **Reset page** removes it.

**Counts only.** The page refuses files that look like voter lists (columns such as VANID, name, address, phone) and real Excel workbooks, with a message saying what to drop instead. Everything it stores is a precinct name and a row of numbers. Still, those numbers are your campaign's returns by precinct and score: treat a workspace file like any internal report.

**Using the hosted copy (the GitHub Pages link).** The link serves the same file from GitHub's servers; the page still runs entirely in your browser, and GitHub never receives your files or counts. Two things are different from a downloaded copy, and both are small:

- GitHub's web servers see that your IP address fetched the page, as they do for any page you open. Not what you loaded onto it.
- The browser stores your counts under the page's web address. On GitHub Pages that address is shared by every page the same GitHub organization publishes, so in principle another page published by that organization could read them while open in the same browser. Only pages that organization itself publishes; not other websites, not the public, not GitHub. A campaign that would rather not rely on that uses the downloaded file, which has an address of its own on your computer.

Anyone, including the other side, can open the link or download the file. That is the point of open source; it gives them the tool, not anyone's data. The tool holds no data of its own.

**Shared computers.** Local storage is per browser profile. On a shared laptop, use **Reset page** when you are done, or a separate browser profile.

## The runner

Everything below applies only to the optional automatic VAN pull ([automation.md](automation.md)).

**It drives VoteBuilder with a browser script.** VAN has no scheduled export for Counts, so the runner opens the saved search, runs it and clicks through the Counts page, one search at a time. It makes no effort to disguise itself: it uses Playwright's stock Chromium, plain clicks, fixed waits only long enough for pages to load, and an exact schedule. NGP VAN can see that it is automation if they look. It makes no changes in VoteBuilder: it runs searches you saved and exports counts, which is what a staffer would do by hand. NGP VAN's terms of use and your state party's VAN user agreement govern automated access to the site; we have not found language in them that addresses scripts one way or the other, and your campaign is responsible for deciding whether this use is acceptable. **Ask your VAN administrator or committee staff before scheduling it.** The manual pull gives the same result without any of this.

**Which login to use.** Two options:

- *A dedicated account without two-step sign-in,* named so audit logs make sense (`votechase-runner`), with the narrowest access that still sees the searches, used only by the runner, deleted after the election. This is the cleaner choice where your committee allows it.
- *A staffer's own account with two-step sign-in.* The first visible run asks for the code, the runner ticks "Remember this device", and the saved browser session stays trusted for about 30 days. When it lapses the runner stops after one attempt and leaves a marker, so scheduled runs do not keep submitting the password and triggering codes; one visible run restores it.

Either way the password sits on the laptop in `runner/.env`. Use a long, unique one, and change it when the person who set the runner up leaves.

**Counts only, checked three ways.** Every export is checked before it is saved: it must be a precinct-by-score crosstab (not a voter list), its score cells must add up to its row totals (VAN sometimes serves a half-computed table; the runner refreshes and tries again), and its total must equal the count of the search that was just run (otherwise VoteBuilder was counting everyone, and the file is discarded). A failed step saves a screenshot of the visible window for troubleshooting, never the page HTML, and no screenshot at all when the page showed voter records or the sign-in form.

**Keep the runner off cloud-synced folders.** `runner/profiles/` holds the browser's live VoteBuilder session and `runner/.env` the password. If the runner folder sits in a folder that iCloud Drive, OneDrive or Dropbox syncs, both are uploaded to that service, and sync clients also corrupt browser profiles. Put the runner in a plain local folder; the page and `data.js` can live on the shared drive.

**The laptop.** Disk encryption on (FileVault, BitLocker), a login password, and it belongs to the campaign.

## Where secrets live

| Secret | Where | Not in |
|---|---|---|
| VoteBuilder password | `runner/.env` on the laptop (file mode 600) | git, the page, logs, `data.js` |
| VoteBuilder session cookies | `runner/profiles/voters/` | git, cloud sync |
| Your counts | the browser's local storage; `data.js` if you use the runner; workspace files you download | GitHub, AI Dems, anyone else |

`runner/.gitignore` excludes all of these. Never commit a runner folder from a laptop that has been set up, and never commit `data.js` or a VAN export.

## What the tool does not do

- Neither the page nor the runner sends anything to AI Dems or any third party. The runner's only network destinations are `votebuilder.com` and `id.ngpvan.com`; the page's only requests are for its own `data.js` or `data.json`.
- No VAN API keys (it does not use the API).
- No changes in VoteBuilder: it runs saved searches and exports counts, which VAN logs like any manual export.
- No voter-level data: refused on the way in, never written on the way out.
