# AI Dems GOTV Tools

Open-source tools from [AI]Dems for Democratic campaigns running get-out-the-vote programs. Each tool is built so a field or data staffer can set it up in an afternoon without an engineer, and so that an engineer who does look at it finds small, readable code.

| Tool | What it does | Needs |
|---|---|---|
| [`tools/ptg`](tools/ptg/) | **Progress to Goals (PTG) tracker.** A Google Sheet that turns two VAN exports into each turf's or organizer's weekly numbers (signups, confirmed leaders, shifts completed) against hand-entered goals. | A VAN login that can export, a Google account |
| [`tools/report-sync`](tools/report-sync/) | **Votebuilder Report Sync.** A Google Sheet that turns Votebuilder report exports into tabs you can build dashboards on: download a saved report, drop the file in, the tab is replaced without breaking your formulas. An optional runner can do the export and upload on a schedule. | A Google account. (Runner: a dedicated Votebuilder account with 2FA off and a laptop that stays on) |
| [`tools/polling-priority`](tools/polling-priority/) | **Polling Location Priority + Line Tracker.** A Google Sheet that ranks polling locations by net vote gain (our expected votes minus everyone else's) instead of raw voter count, and on election day shows live wait times from LBJ next to the ranking so line-warming volunteers go where long lines cost us most. | Per-location sums of a turnout and a support score (SQL templates and a local CSV aggregator included), a Google account; for live waits, LBJ and a laptop that stays on |
| [`tools/vote-chase`](tools/vote-chase/) | **Vote Chase.** A single web page that ranks precincts by the Democratic-leaning and persuadable voters who have not voted yet, from two VAN count exports (returned and registered, by precinct and support score), with stacked bars, county or turf filters, and CSV, print and copy-as-text for the morning huddle. Nothing is uploaded; it runs in the browser. An optional runner pulls the counts from VAN every morning. | A VAN login that can run Counts. (Runner: a laptop that stays on, Node.js) |
| [`tools/observer-vetting`](tools/observer-vetting/) | **Poll Observer Vetting.** A Google Sheet that marks each volunteer poll observer Pass, Review or Flag: by party and support score for people on your voter file, by public FEC donation history for everyone else, with a note saying what to check. | A free FEC API key, a Google account, your observer list (a VAN export) |

## Principles

- **The Sheet (or the page) is the product.** Non-technical users only ever touch a Google Sheet, or a single web page that runs entirely in their browser. Anything that needs code runs inside the Sheet (Apps Script) or inside the page, with no servers, keys files, or deploys. When a tool truly needs more than Apps Script (Report Sync needs a browser), the extra piece is a single folder with a guided `npm run setup`, and the Sheet stays the only place config lives.
- **Config in one place.** Every campaign-specific value lives on a `Setup` tab. Nothing campaign-specific is hard-coded.
- **A fixed data contract.** Each tool reads its data from a plain `raw` tab with documented columns, so a campaign with a data warehouse can feed the same dashboard from BigQuery, Civis, or a CSV instead of the built-in VAN job.
- **No voter PII leaves VAN.** Tools export aggregate counts only. The one exception is Observer Vetting, whose job is to look at named volunteers; its README says how to share and when to delete.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Released under the [MIT License](LICENSE).
