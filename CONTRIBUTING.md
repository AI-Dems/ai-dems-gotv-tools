# Contributing

Thanks for helping. A few ground rules keep these tools usable by campaigns that don't have an engineer on staff.

## Layout

```
tools/<tool-name>/
  README.md          what it is, 15-minute setup
  docs/              setup, metrics definitions, data contract, troubleshooting
  apps-script/       the code that runs inside the Google Sheet (a clasp project)
  runner/            only when a tool needs code outside the Sheet (Node, `npm run setup`, tests)
  feeders/           only when the Sheet's input tab can be filled from several places (SQL templates, local scripts)
```

## Rules of thumb

- **Config lives on the Sheet's `Setup` tab, never in code.** If you find yourself typing a survey question ID, a date, or a turf name into a `.gs` file, move it to `Setup`.
- **Keep the data contract stable.** The `raw` tab columns are an interface other feeders rely on. Add columns at the end; never rename or reorder.
- **Pure logic stays pure.** Counting and bucketing functions take plain arrays and return plain arrays, so they can be tested in Node without Google services. See `tools/ptg/apps-script/test/`.
- **No secrets in cells or code.** If a tool ever needs a credential, it goes in `PropertiesService` via a menu dialog, never in a cell.
- **Minimise PII.** Imported VAN data lives on hidden tabs, docs ask for the fewest columns, and every tool offers a one-click clear.
- **Write docs for the organizing director, not the engineer.** Technical detail goes in `docs/data-contract.md`.

## Workflow

1. Open an issue describing the change.
2. Branch, make the change, run `npm test` inside the tool's `apps-script/` folder.
3. Open a pull request. A maintainer will test it against a live VAN committee before merging.

## Releasing a template Sheet

After merging changes to `apps-script/`, a maintainer pushes the code to the master template Sheet with `clasp push`, runs **PTG → Build sheet**, and verifies with **PTG → Run now** against a test committee. The "Make a copy" link in the tool README always points at that master template.
