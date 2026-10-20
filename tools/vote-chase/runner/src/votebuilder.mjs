/**
 * Drives Votebuilder for one Quick Counts export: My Voters → saved search →
 * Counts → Quick Counts → Export To Excel, then either the browser's direct
 * download or My Export Files. Every page visit also keeps the session in the
 * account's database (My Campaign or My Voters). The sign-in, session, My Export
 * Files and download code is from votebuilder-report-sync, unchanged; the
 * navigation to the Counts pages is new and unverified.
 */
import fs from "node:fs";
import { WAIT, click, settle, typeInto } from "./actions.mjs";
import { logIn, onLoginPage } from "./login.mjs";

export const BASE = "https://www.votebuilder.com";
export const EXPORT_LIST_URL = `${BASE}/ExportList.aspx`;

export const SEL = {
  signedIn: "#sidebar-search-input",
  databaseTab: ".app-nav ul.nav-tabs.hide-sm a",
  exportModal: "#exportModal",
  exportGrid: "#ctl00_ContentPlaceHolderVANPage_gvList",
  exportSortByDate: '#ctl00_ContentPlaceHolderVANPage_gvList thead a:has-text("Exported")'
};

const EXPORT_WAIT_MS = 10 * 60 * 1000;

/** Poll an async predicate until truthy or timeout. Returns its last value. */
export async function waitFor(fn, { timeout = 10000, interval = 250, what = "condition" } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn().catch(() => false);
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeout}ms waiting for ${what}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

function signedIn(page) {
  return page.locator(SEL.signedIn).isVisible().catch(() => false);
}

/** "My Campaign" or "My Voters", from the context Votebuilder embeds in each page. Null when absent. */
function currentDatabase(page) {
  return page.evaluate(() => window.van?.context?.currentTabName ?? null).catch(() => null);
}

/** Escape a literal for use inside a RegExp. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Escape `s` and let any run of whitespace in it match any run of whitespace. */
const spacedPattern = (s) => escapeRegExp(norm(s)).replace(/\s+/g, "\\s+");

/** Click the header tab for database `name` and wait until the session is in it. */
async function switchDatabase(page, name, { log }) {
  const from = await currentDatabase(page);
  // `name` is one of the two fixed database names ("My Voters" / "My Campaign"), escaped and anchored.
  const exact = new RegExp(`^\\s*${escapeRegExp(name)}\\s*$`); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const tab = page.locator(SEL.databaseTab).filter({ hasText: exact });
  if (!(await tab.count())) throw new Error(`no "${name}" tab in the Votebuilder header, so this account may lack access to it`);
  await click(tab.first());
  await waitFor(async () => (await currentDatabase(page)) === name, {
    timeout: 45000,
    interval: 500,
    what: `${name} to open`
  }).catch(() => {
    if (/SelectCommittee/i.test(page.url())) throw new Error(`Votebuilder asked which committee to open in ${name}`);
    throw new Error(`could not switch to ${name} (at ${page.url()})`);
  });
  log?.(`switched from ${from} to ${name}`);
  await settle(page);
}

/**
 * Open `url` and wait until `ready(page)` holds. On the way it signs in when
 * Votebuilder sends the browser to the ActionID login page, and it switches to
 * `database` when the session is in the other one. Ends with a reading pause,
 * for the page to finish loading before acting on it.
 */
export async function visit(page, url, ready, { credentials, database, log, headed = false, what = url, timeout = 60000 }) {
  const goto = () => page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await goto();
  let loggedIn = false;
  let switched = false;
  for (;;) {
    const state = await waitFor(
      async () => (onLoginPage(page) ? "login" : (await ready(page)) ? "ready" : false),
      { timeout, interval: 500, what: `${what} to load (at ${page.url()})` }
    );

    if (state === "login") {
      // ActionID bounces a still-valid session straight back; give that redirect a moment.
      await page.waitForTimeout(1500);
      if (!onLoginPage(page)) continue;
      if (loggedIn) throw new Error(`still on the ActionID login page after signing in (at ${page.url()})`);
      loggedIn = true;
      await logIn(page, credentials, { log, headed });
      await settle(page);
      await goto();
      continue;
    }

    const current = database ? await currentDatabase(page) : null;
    if (current && current !== database) {
      if (switched) throw new Error(`still in ${current} after switching to ${database}`);
      switched = true;
      await switchDatabase(page, database, { log });
      await goto();
      continue;
    }
    return settle(page);
  }
}

// ---- Saved search → Counts → Quick Counts ----
//
// UNVERIFIED: everything in this section was written without access to the
// Counts pages. The fork's Report Manager code is gone; these steps follow VAN's
// documented menus (My Voters → saved search → Counts → Quick Counts → Export
// To Excel) and match controls by their visible text. Each step logs which
// control it used, and dumps the page into failures/ when it finds none, so a
// first run with --headed shows exactly what needs adjusting.

/** Locators tried in order, by visible text. Edit these first if a step fails. */
export const NAV = {
  // Reaching the list of saved searches from the My Voters home page.
  savedSearches: [
    (p) => p.getByRole("link", { name: /^\s*(my\s+)?saved\s+searches\s*$/i }),
    (p) => p.getByRole("link", { name: /saved\s+(searches|lists)/i }),
    (p) => p.getByRole("link", { name: /create a new list/i })
  ],
  // On the Create a New List page: the control that opens saved searches.
  loadSearch: [
    // On "Create A New Search" the saved searches open from the "Open" button at the top right (seen Oct 2026).
    (p) => p.getByRole("button", { name: /^\s*open\s*$/i }),
    (p) => p.getByRole("link", { name: /^\s*open\s*$/i }),
    (p) => p.locator('a, button, input[type="button"], input[type="submit"]').filter({ hasText: /^\s*open\s*$/i }),
    (p) => p.getByRole("link", { name: /load.*(saved )?search/i }),
    (p) => p.getByRole("button", { name: /load.*(saved )?search/i }),
    (p) => p.getByRole("link", { name: /^\s*saved\s+searches?\s*$/i })
  ],
  // After a saved search loads, the control that runs it to get results.
  runSearch: [
    (p) => p.getByRole("button", { name: /^\s*run\s+search\s*$/i }),
    (p) => p.locator('a, button, input[type="button"], input[type="submit"]').filter({ hasText: /^\s*run\s+search\s*$/i }),
    (p) => p.getByRole("button", { name: /^\s*(search|run search|load)\s*$/i }),
    (p) => p.locator('input[type="submit"][value="Search"]'),
    (p) => p.locator('input[type="submit"][value="Load"]')
  ],
  counts: [
    // The left sidebar's "Counts and Crosstabs" (under Reporting) opens the Counts page for the current list.
    (p) => p.getByRole("link", { name: /^\s*counts\s+and\s+crosstabs\s*$/i }),
    (p) => p.locator("a").filter({ hasText: /^\s*counts\s+and\s+crosstabs\s*$/i }),
    (p) => p.getByRole("link", { name: /^\s*counts\s*$/i }),
    (p) => p.getByRole("tab", { name: /^\s*counts\s*$/i }),
    (p) => p.getByRole("button", { name: /^\s*counts\s*$/i })
  ],
  quickCounts: [
    (p) => p.getByRole("link", { name: /run\s+quick\s+counts/i }),
    (p) => p.getByRole("link", { name: /quick\s+counts/i }),
    (p) => p.getByRole("tab", { name: /quick\s+counts/i }),
    (p) => p.getByRole("button", { name: /quick\s+counts/i })
  ],
  // On the Counts and Crosstabs page: the Crosstab 1 and Column 1 pickers and the Refresh button.
  crosstabPicker: [
    (p) => p.getByLabel(/^\s*crosstab\s*1\s*$/i),
    (p) => p.getByText(/^\s*crosstab\s*1\s*$/i).first().locator("xpath=following::input[1]"),
    (p) => p.getByText(/^\s*crosstab\s*1\s*$/i).first().locator("xpath=following::*[@role='combobox' or @role='button' or self::select][1]")
  ],
  columnPicker: [
    (p) => p.getByLabel(/^\s*column\s*1\s*$/i),
    (p) => p.getByText(/^\s*column\s*1\s*$/i).first().locator("xpath=following::input[1]"),
    (p) => p.getByText(/^\s*column\s*1\s*$/i).first().locator("xpath=following::*[@role='combobox' or @role='button' or self::select][1]")
  ],
  refreshResults: [
    (p) => p.getByRole("button", { name: /refresh\s+results/i }),
    (p) => p.getByRole("link", { name: /refresh\s+results/i }),
    (p) => p.locator('input[value*="Refresh" i]')
  ],
  exportExcel: [
    (p) => p.getByRole("button", { name: /export\s+to\s+excel/i }),
    (p) => p.getByRole("link", { name: /export\s+to\s+excel/i }),
    (p) => p.locator('input[value*="Export To Excel" i]')
  ],
  // The My Export Files hint VAN shows when it queues an export instead of downloading it.
  exportQueued: [
    (p) => p.locator(SEL.exportModal),
    (p) => p.getByText(/export (is )?(in progress|queued|requested)/i)
  ]
};

/** The first visible locator from `candidates`, or null. Waits up to `timeout` ms in total. */
async function firstVisible(page, candidates, timeout = 15000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const [i, make] of candidates.entries()) {
      const loc = make(page).first();
      if (await loc.isVisible().catch(() => false)) return { loc, index: i };
    }
    if (Date.now() > deadline) return null;
    await page.waitForTimeout(400);
  }
}

/** Click the first visible control from `candidates`; throw naming `what` when none shows. */
async function clickStep(page, candidates, what, { log, timeout } = {}) {
  const hit = await firstVisible(page, candidates, timeout);
  if (!hit) throw new Error(`could not find "${what}" on the page (at ${page.url()})`);
  log?.(`  ${what}: clicked option ${hit.index + 1} of ${candidates.length}`);
  await click(hit.loc);
  await settle(page);
  return hit.index;
}

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** A pattern matching `name` as a whole link or cell text, forgiving case and spacing. */
export function searchNamePattern(name) {
  // `name` comes from the user's own config; it is escaped and anchored, and runs against their own browser session.
  return new RegExp(`^\\s*${spacedPattern(name)}\\s*$`, "i"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
}



/** The number in the sidebar's "My List (657,592 People)", or null. */
/** The number in "My List (51,328 People)" or "My List (1 Person)", or null. */
export function parseListCount(text) {
  const m = /\(\s*([\d,]+)\s+(people|person)\s*\)/i.exec(String(text ?? ""));
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

export async function myListCount(page) {
  const t = await page.locator("a.page").filter({ hasText: /my list/i }).first().innerText().catch(() => "");
  return parseListCount(t);
}

/** Text of the search editor's summary panel, used to notice when a saved search has loaded. */
function searchSummary(page) {
  return page.locator("#SearchSummary").innerText().catch(() => "");
}

/** Scopes to try for the Open Saved Search dialog: the page itself, then each iframe. */
function dialogScopes(page) {
  const scopes = [page];
  for (const f of page.frames()) if (f !== page.mainFrame()) scopes.push(f);
  return scopes;
}

/**
 * In the Open Saved Search dialog, choose the folder that holds `name`, choose
 * the search, and click Open. Returns true when done, false when no such dialog
 * is on the page. Throws when the dialog is there but the search is not in any folder.
 */
/** True for a dropdown placeholder such as "-- Select --" or "Select a folder", not a real folder name. */
export function isPlaceholderOption(text) {
  const t = String(text ?? "").trim();
  return !t || /^-*\s*(please\s+)?select(\s+(a|an|one))?(\s+\w+)?\s*-*$/i.test(t) || /^-+$/.test(t);
}

export async function pickSavedSearchInDialog(page, name, opts) {
  const deadline = Date.now() + 30000;
  let folderSel = null, scope = null;
  while (Date.now() < deadline && !folderSel) {
    for (const sc of dialogScopes(page)) {
      const byLabel = sc.getByLabel(/^\s*folder\s*$/i).first();
      if (await byLabel.isVisible().catch(() => false)) { folderSel = byLabel; scope = sc; break; }
      const sels = sc.locator("select");
      const n = await sels.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const sel = sels.nth(i);
        const near = await sel.evaluate((el) => (el.closest("tr, div, li")?.innerText || "")).catch(() => "");
        if (/folder/i.test(near) && (await sel.isVisible().catch(() => false))) { folderSel = sel; scope = sc; break; }
      }
      if (folderSel) break;
    }
    if (!folderSel) await page.waitForTimeout(500);
  }
  if (!folderSel) return false;

  const searchSel = async () => {
    const byLabel = scope.getByLabel(/saved\s+search/i).first();
    if (await byLabel.isVisible().catch(() => false)) return byLabel;
    const sels = scope.locator("select");
    const n = await sels.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const sel = sels.nth(i);
      const near = await sel.evaluate((el) => (el.closest("tr, div, li")?.innerText || "")).catch(() => "");
      if (/saved\s+search/i.test(near)) return sel;
    }
    return null;
  };
  // Folder layouts differ by campaign, so no folder is assumed: each one is opened in turn
  // and its saved searches are checked for the expected name.
  const folders = (await folderSel.locator("option").allTextContents()).map((t) => t.trim()).filter((t) => !isPlaceholderOption(t));
  opts.log?.(`  Open Saved Search dialog: ${folders.length} folder(s)`);
  const wanted = searchNamePattern(name);
  // Choosing a folder fills the Saved Search list asynchronously. Read it only once it is
  // enabled and its options have stopped changing; a list read too early is simply empty.
  const namesIn = async (ss) => (await ss.locator("option").allTextContents()).map((t) => t.trim());
  const settledNames = async (ss) => {
    await waitFor(async () => !(await ss.isDisabled().catch(() => true)), { timeout: 8000, what: "the Saved Search list" }).catch(() => {});
    let last = await namesIn(ss);
    const deadline = Date.now() + 8000;
    for (;;) {
      await page.waitForTimeout(500);
      const now = await namesIn(ss);
      const real = now.filter((t) => !isPlaceholderOption(t)).length;
      if (now.join("\n") === last.join("\n") && (real > 0 || Date.now() > deadline)) return now;
      if (Date.now() > deadline) return now;
      last = now;
    }
  };
  // A list that was still filling can hide the name; walk the folders a second time before giving up.
  for (let pass = 1; pass <= 2; pass++) {
  if (pass === 2) { opts.log?.("  not found on the first look through the folders; looking again"); await page.waitForTimeout(2000); }
  for (const folder of folders) {
    await folderSel.selectOption({ label: folder });
    await folderSel.dispatchEvent("change").catch(() => {});
    const ss = await searchSel();
    if (!ss) continue;
    const names = await settledNames(ss);
    const hit = names.find((t) => wanted.test(t));
    if (!hit) continue;
    await ss.selectOption({ label: hit });
    await ss.dispatchEvent("change").catch(() => {});
    opts.log?.(`  found saved search "${hit}" in folder "${folder}"`);
    await settle(page);
    const openBtn = scope.getByRole("button", { name: /^\s*open\s*$/i }).last();
    const openAlt = scope.locator('button, input[type="button"], input[type="submit"], a').filter({ hasText: /^\s*open\s*$/i }).last();
    const btn = (await openBtn.isVisible().catch(() => false)) ? openBtn : openAlt;
    if (!(await btn.isVisible().catch(() => false))) throw new Error("chose the saved search but found no Open button in the dialog");
    await click(btn);
    return true;
  }
  }
  throw new Error(`no saved search named "${name}" in any of the ${folders.length} folder(s) this account can see: ${folders.join("; ")}`);
}

/** Open the saved search `name` in My Voters and run it, ending on its results page. */
export async function openSavedSearch(page, name, opts) {
  await visit(page, `${BASE}/`, (p) => signedIn(p), { ...opts, what: "the My Voters home page" });
  const via = await clickStep(page, NAV.savedSearches, "Saved Searches / Create a New List", opts);
  // The last candidate is Create a New List, which needs one more click to reach saved searches.
  if (via === NAV.savedSearches.length - 1) await clickStep(page, NAV.loadSearch, "Load a Saved Search", opts);

  // VAN's "Open Saved Search" dialog (seen Oct 2026): a Folder dropdown, then a
  // Saved Search dropdown that fills once a folder is chosen, then an Open button.
  // The dialog is a Telerik window whose content lives in an iframe, so look on
  // the page first and then inside every frame.
  const countBefore = await myListCount(page);
  const summaryBefore = await searchSummary(page);
  const picked = await pickSavedSearchInDialog(page, name, opts);
  if (!picked) {
    // Older layout: the saved search is a plain link or row on the page.
    const exact = searchNamePattern(name);
    const link = page.getByRole("link", { name: exact }).first();
    const row = page.getByText(exact).first();
    const linkShown = await link.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
    const target = linkShown ? link : row;
    if (!(await target.isVisible().catch(() => false))) {
      throw new Error(`the Open Saved Search dialog did not appear within 30 seconds of clicking Open (VoteBuilder may be slow), and no saved search named "${name}" is listed on the page either`);
    }
    opts.log?.(`  found saved search "${name}"`);
    await click(target);
  }
  // Opening a saved search fills the editor asynchronously. Clicking Run Search before
  // that finishes runs the empty default search (everyone in the district), so wait for
  // the summary panel to change and the loading spinner to go away.
  if (picked) {
    await waitFor(async () => {
      const spinner = await page.locator(".StepLoadingSpinner").first().isVisible().catch(() => false);
      const summary = await searchSummary(page);
      return !spinner && summary && summary !== summaryBefore && !/start with anyone/i.test(summary);
    }, { timeout: 45000, interval: 500, what: `the saved search "${name}" to load into the editor` }).catch(() => {
      // Do not continue: Run Search now would count everyone in the committee, and that
      // export would pass the totals check (the list would be everyone too).
      throw new Error(`the saved search "${name}" was chosen but did not load into the search editor within 45 seconds, so Run Search was not clicked (it would have run the empty default search, which is everyone in the committee)`);
    });
    opts.log?.("  saved search loaded into the editor");
  }
  await settle(page);

  const run = await firstVisible(page, NAV.runSearch, 5000);
  if (!run) throw new Error("the loaded search shows no Run Search button");
  opts.log?.("  running the loaded search");
  await click(run.loc);
  // The run is done when the results page opens or the sidebar's My List count is refreshed.
  // The count may legitimately stay the same (same search as last time), so a static count
  // is not an error; the "loaded into the editor" wait above is what guards against running
  // the empty default search.
  const startUrl = page.url();
  await waitFor(async () => {
    if (page.url() !== startUrl) return true;
    const c = await myListCount(page);
    return c != null && c !== countBefore;
  }, { timeout: 120000, interval: 1000, what: "Run Search to finish" }).catch(() => {
    opts.log?.("  WARNING: no sign that Run Search finished within 2 minutes; continuing");
  });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  const countAfter = await myListCount(page);
  opts.log?.(`  My List now ${countAfter == null ? "updated" : countAfter.toLocaleString() + " people"}${countAfter != null && countAfter === countBefore ? " (same as before the run)" : ""}`);
  await settle(page);
  return countAfter;
}

/**
 * The "Total People" figure inside a VAN count export (UTF-16 HTML table), or null.
 * The totals row starts with "Total People"; the figure is read from the column the
 * header row calls "Total People" (a trailing percent column would otherwise be read
 * as the total), falling back to the last plain number in the row.
 */
export function totalPeopleIn(body) {
  const txt = body[0] === 0xff && body[1] === 0xfe ? body.toString("utf16le") : body.toString("utf8");
  const rows = txt.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const clean = (h) => h.replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, " ").trim();
  // Header cells are expanded by their colspan (VAN's header is "Precinct | <score, spanning
  // every band> | Total People"), so a header index lines up with the totals row's columns.
  const cellsOf = (r, expand) => [...r.matchAll(/<t([dh])([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].flatMap((c) => {
    const span = expand ? Math.max(1, Number(/colspan=["']?(\d+)/i.exec(c[2])?.[1] ?? 1)) : 1;
    return Array(span).fill(clean(c[3]));
  });
  const table = rows.map((r) => cellsOf(r, false));
  const totalsRow = table.find((c) => c.length > 1 && /^total people$/i.test(c[0]));
  if (!totalsRow) return null;
  const isCount = (v) => /^\d{1,3}(,\d{3})*$|^\d+$/.test(v);
  const headerRaw = rows.find((r) => { const c = cellsOf(r, false); return c.length > 1 && !/^total people$/i.test(c[0]) && c.some((v) => /^total people$/i.test(v)); });
  const header = headerRaw ? cellsOf(headerRaw, true) : null;
  const col = header ? header.findIndex((v) => /^total people$/i.test(v)) : -1;
  // Trust the header column only when the expanded header is as wide as the totals row.
  let cell = header && header.length === totalsRow.length && col >= 0 && isCount(totalsRow[col]) ? totalsRow[col] : null;
  // Otherwise the last plain count in the row (skipping a trailing "100.0%" percent cell).
  if (cell == null) cell = [...totalsRow.slice(1)].reverse().find(isCount) ?? null;
  return cell == null ? null : Number(cell.replace(/,/g, ""));
}

/**
 * The Quick Counts page's dropdowns as {label, selected} pairs, for every
 * select whose label mentions crosstab, column or row. Works from the DOM
 * alone: a <label for>, a wrapping <label>, or the text just before the select.
 */
export function readCrosstabSettings(page) {
  return page.evaluate(() => {
    const labelOf = (el) => {
      const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (byFor) return byFor.innerText;
      const wrap = el.closest("label");
      if (wrap) return wrap.innerText;
      const cell = el.closest("td, div, li");
      return cell?.previousElementSibling?.innerText || cell?.innerText?.split("\n")[0] || "";
    };
    return [...document.querySelectorAll("select")]
      .map((el) => ({
        label: labelOf(el).replace(/\s+/g, " ").trim(),
        selected: el.selectedOptions[0]?.text?.replace(/\s+/g, " ").trim() ?? ""
      }))
      .filter((s) => /crosstab|column|row/i.test(s.label));
  });
}

/**
 * Throw when a dropdown labelled `labelWord` is present but none of its
 * selected values contains `expected`. A missing dropdown only warns, since
 * the label text is a guess.
 */
export function checkSetting(settings, labelWord, expected, log) {
  if (!expected) return;
  const relevant = settings.filter((s) => norm(s.label).includes(labelWord));
  if (!relevant.length) {
    log?.(`  WARNING: no "${labelWord}" dropdown found, so "${expected}" was not checked; look at the screenshot`);
    return;
  }
  if (!relevant.some((s) => norm(s.selected) === norm(expected))) {
    const seen = relevant.map((s) => `${s.label}="${s.selected}"`).join("; ");
    throw new Error(`Quick Counts ${labelWord} is not what this slot expects ("${expected}"); page shows ${seen}`);
  }
}

/** What a picker currently shows: its value for an input/select, else its text. */
async function pickerValue(loc) {
  return loc.evaluate((el) => {
    if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.text ?? "";
    if ("value" in el && typeof el.value === "string") return el.value;
    return el.innerText || el.textContent || "";
  }).catch(() => "");
}

/** Ways to find the option `value` once a picker is open: option, tree item, list item, plain text. */
const optionCandidates = (value) => {
  // `value` is a picker choice from the user's own config, escaped before use.
  const re = new RegExp(spacedPattern(value), "i"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  return [
    (p) => p.getByRole("option", { name: re }),
    (p) => p.getByRole("treeitem", { name: re }),
    (p) => p.getByRole("menuitem", { name: re }),
    (p) => p.locator("li, a, span, div").filter({ hasText: re }).filter({ visible: true }).last()
  ];
};

/**
 * Make the picker found by `candidates` show `value`. If it already does, nothing is
 * clicked. For a <select> the option is chosen directly; otherwise the picker is
 * opened, the value typed when it accepts typing, and the matching option clicked.
 * Throws if the picker cannot be found or still does not show the value afterwards.
 */
export async function setPicker(page, candidates, value, what, opts) {
  const hit = await firstVisible(page, candidates, opts.timeout ?? 15000);
  if (!hit) throw new Error(`could not find the "${what}" picker on the Counts page (at ${page.url()})`);
  const before = await pickerValue(hit.loc);
  // Exact match only: "X v2" or "X (old)" already showing must not count as X.
  if (norm(before) === norm(value)) { opts.log?.(`  ${what}: already "${before.trim()}"`); return; }
  opts.log?.(`  ${what}: shows "${before.trim() || "(blank)"}", setting "${value}"`);
  const isSelect = await hit.loc.evaluate((el) => el instanceof HTMLSelectElement).catch(() => false);
  if (isSelect) {
    await hit.loc.selectOption({ label: value }).catch(async () => {
      const labels = await hit.loc.locator("option").allTextContents();
      const match = labels.find((l) => norm(l).includes(norm(value)));
      if (!match) throw new Error(`"${what}" has no option containing "${value}"`);
      await hit.loc.selectOption({ label: match });
    });
  } else {
    await click(hit.loc);
    await settle(page);
    const typable = await hit.loc.evaluate((el) => el instanceof HTMLInputElement || el.isContentEditable).catch(() => false);
    if (typable) { await hit.loc.fill("").catch(() => {}); await typeInto(hit.loc, value); await settle(page); }
    const opt = await firstVisible(page, optionCandidates(value), 10000);
    if (!opt) throw new Error(`opened the "${what}" picker but found no choice containing "${value}"`);
    await click(opt.loc);
    await settle(page);
  }
  const after = await pickerValue(hit.loc);
  if (norm(after) !== norm(value)) {
    // Some pickers replace the control after a choice; re-find it before giving up.
    const again = await firstVisible(page, candidates, 3000);
    const v2 = again ? await pickerValue(again.loc) : "";
    if (norm(v2) !== norm(value)) throw new Error(`"${what}" still shows "${(v2 || after).trim()}" after choosing "${value}"`);
  }
  opts.log?.(`  ${what}: now "${value}"`);
}


/**
 * VAN's Counts page pickers are Telerik tree combo boxes (ids ending in
 * "_rcbtv__s1_ct1" for Section 1 Crosstab 1 and "_rcbtv__g1" for Column 1).
 * The read-only input shows the choice; the arrow opens a drop-down holding a
 * RadTreeView whose branches ("Scores", "Data Field") start collapsed.
 * Returns the combo's root id, or null when no such control is on the page.
 */
async function treeComboRoot(page, suffix) {
  const input = page.locator(`input[id$="${suffix}_Input"]`).first();
  if (!(await input.isVisible().catch(() => false))) return null;
  const id = await input.getAttribute("id");
  return id.replace(/_Input$/, "");
}

/** Make the tree combo `root` show `value`: open it, expand the branch that holds the node, click the node. */
export async function setTreeCombo(page, root, value, what, opts) {
  const input = page.locator(`#${root}_Input`);
  const before = (await input.inputValue().catch(() => "")).trim();
  // Exact match only: "X v2" already showing must not count as X.
  if (norm(before) === norm(value)) { opts.log?.(`  ${what}: already "${before}"`); return; }
  opts.log?.(`  ${what}: shows "${before || "(blank)"}", choosing "${value}" from the tree`);
  const dropdown = page.locator(`#${root}_DropDown`);
  const isOpen = () => dropdown.isVisible().catch(() => false);
  // The arrow of one picker can sit under the next picker's box (VAN's layout overlaps them),
  // so try the text field first, then the arrow, then a forced click, then Telerik's own API.
  const openers = [
    () => click(input, { timeout: 5000 }),
    () => click(page.locator(`#${root}_Arrow`), { timeout: 5000 }),
    () => page.locator(`#${root}_Arrow`).click({ force: true }),
    () => page.evaluate((id) => { const c = window.$find && window.$find(id); if (c && c.showDropDown) c.showDropDown(); }, root)
  ];
  for (const open of openers) {
    if (await isOpen()) break;
    await open().catch(() => {});
    await page.waitForTimeout(700);
  }
  if (!(await isOpen())) throw new Error(`could not open the "${what}" picker`);
  // `value` is a tree choice from the user's own config, escaped and anchored.
  const exact = new RegExp(`^\\s*${spacedPattern(value)}\\s*$`, "i"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const node = dropdown.locator(".RadTreeView .rtIn").filter({ hasText: exact }).first();
  if (!(await node.count())) {
    const seen = (await dropdown.locator(".RadTreeView .rtIn").allTextContents()).map((t) => t.trim()).filter(Boolean);
    throw new Error(`"${value}" is not in the "${what}" tree. Choices include: ${seen.slice(0, 40).join("; ")}${seen.length > 40 ? "…" : ""}`);
  }
  // Expand every collapsed ancestor branch, top-down, by its "+" icon.
  const expanders = node.locator('xpath=ancestor::li[contains(@class,"rtLI")]/div/span[contains(@class,"rtPlus")]');
  const n = await expanders.count();
  for (let i = 0; i < n; i++) {
    const plus = expanders.nth(i);
    if (await plus.isVisible().catch(() => false)) { await click(plus, { timeout: 8000 }).catch(() => plus.click({ force: true, timeout: 10000 })); await page.waitForTimeout(500); }
  }
  await node.scrollIntoViewIfNeeded().catch(() => {});
  await click(node, { timeout: 8000 }).catch(() => node.click({ force: true, timeout: 10000 }));
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await settle(page);
  const after = (await page.locator(`#${root}_Input`).inputValue().catch(() => "")).trim();
  if (norm(after) !== norm(value)) throw new Error(`"${what}" still shows "${after || "(blank)"}" after choosing "${value}"`);
  opts.log?.(`  ${what}: now "${after}"`);
}

/**
 * From the results page: open Counts (and Quick Counts when that is a separate
 * link), set Crosstab 1 to the score and Column 1 to Precinct, click Refresh
 * Results, and end on the Counts and Crosstabs report ready to export. VAN does
 * not save these pickers with the search, so they are set on every run.
 */
/** Click Refresh Results on the Counts page and wait for the table to settle. `extraMs` adds a longer wait on a retry. */
export async function refreshResults(page, opts, extraMs = 0) {
  const refresh = await firstVisible(page, NAV.refreshResults, 8000);
  if (!refresh) { opts.log?.("  WARNING: no Refresh Results button found; exporting what the page shows"); return false; }
  opts.log?.("  Refresh Results: clicked");
  await click(refresh.loc);
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  if (extraMs) await page.waitForTimeout(extraMs);
  await settle(page);
  return true;
}

/**
 * Whether the crosstab's cells add up: for every precinct row, the band cells must sum to
 * that row's Total People. VAN has served exports whose row totals were right but whose band
 * cells were still being computed (Oct 2026), which the Total People check cannot see.
 * Returns {rowsOff, bands, totals} where rowsOff is the number of rows that do not add up.
 */
export function bandSumGap(body) {
  const txt = body[0] === 0xff && body[1] === 0xfe ? body.toString("utf16le") : body.toString("utf8");
  const rows = txt.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const cellsOf = (r) => [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1].replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, " ").trim());
  const num = (v) => Number(String(v).replace(/,/g, "")) || 0;
  const isCount = (v) => /^\d{1,3}(,\d{3})*$|^\d+$/.test(v);
  let rowsOff = 0, bands = 0, totals = 0;
  for (const c of rows.map(cellsOf)) {
    if (c.length < 3 || /^total people$/i.test(c[0]) || /^precinct/i.test(c[0]) || !isCount(c[c.length - 1])) continue;
    const vals = c.slice(1, -1).filter(isCount);
    if (vals.length < 2) continue;
    const b = vals.reduce((a, v) => a + num(v), 0), t = num(c[c.length - 1]);
    bands += b; totals += t;
    if (b !== t) rowsOff++;
  }
  return { rowsOff, bands, totals };
}

export async function openQuickCounts(page, entry, opts) {
  await clickStep(page, NAV.counts, "Counts", opts);
  const qc = await firstVisible(page, NAV.quickCounts, 8000);
  if (qc) { opts.log?.("  Quick Counts: clicked"); await click(qc.loc); await settle(page); }
  else opts.log?.("  Quick Counts: no separate link; assuming Counts opened the crosstab page");
  const ctRoot = await treeComboRoot(page, "_rcbtv__s1_ct1");
  const colRoot = await treeComboRoot(page, "_rcbtv__g1");
  if (entry.crosstab) {
    if (ctRoot) await setTreeCombo(page, ctRoot, entry.crosstab, "Crosstab 1", opts);
    else await setPicker(page, NAV.crosstabPicker, entry.crosstab, "Crosstab 1", opts);
  } else opts.log?.("  WARNING: no crosstab named in searches.json; leaving Crosstab 1 as the page shows it");
  if (entry.column) {
    if (colRoot) await setTreeCombo(page, colRoot, entry.column, "Column 1", opts);
    else await setPicker(page, NAV.columnPicker, entry.column, "Column 1", opts);
  }
  // "People from": VAN defaults this to "Registered Voters" (everyone in the committee),
  // which silently counts the whole district. It must be "My List" (the search just run).
  const source = page.locator('select[id$="_ddlSourceOptions"]').first();
  if (await source.isVisible().catch(() => false)) {
    const current = (await source.evaluate((el) => el.selectedOptions[0]?.text || "").catch(() => "")).trim();
    if (!/my list/i.test(current)) {
      await source.selectOption({ label: "My List" }).catch(async () => {
        const labels = await source.locator("option").allTextContents();
        const hit = labels.find((l) => /my list/i.test(l));
        if (!hit) throw new Error(`the "People from" dropdown has no "My List" option (has: ${labels.join(", ")})`);
        await source.selectOption({ label: hit });
      });
      await source.dispatchEvent("change").catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      opts.log?.(`  People from: was "${current}", now "My List"`);
    } else opts.log?.("  People from: My List");
  } else opts.log?.('  WARNING: no "People from" dropdown found; the counts may be of everyone, not the list');
  await refreshResults(page, opts);
  const settings = await readCrosstabSettings(page);
  for (const s of settings) opts.log?.(`  ${s.label}: ${s.selected}`);
  checkSetting(settings, "crosstab", entry.expectCrosstab, () => {});
  checkSetting(settings, "column", entry.expectColumn, () => {});
}

/**
 * Click Export To Excel and capture the file. Chromium's own download path has
 * crashed the browser on this step (SIGSEGV, Oct 2026), so the export response
 * is intercepted on the wire instead: the script fetches it, keeps the bytes,
 * and answers the page with an empty reply so no browser download ever starts.
 * Resolves to {kind: "download", body} or, when VAN queues the export on My
 * Export Files, {kind: "queued"}.
 */
export async function clickExport(page, opts) {
  let captured = null;
  let settled = false;
  const handler = async (route) => {
    const type = route.request().resourceType();
    if (settled || !["document", "xhr", "fetch", "other"].includes(type)) return route.continue();
    let resp;
    try { resp = await route.fetch(); } catch { return route.continue(); }
    if (looksLikeExportResponse(resp.headers())) {
      const cd = resp.headers()["content-disposition"] || "";
      const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd);
      captured = { body: await resp.body(), filename: m ? decodeURIComponent(m[1].trim()) : "export.xls" };
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ response: resp });
  };
  let download = null;
  const onDownload = (d) => { download = d; };
  page.on("download", onDownload);
  await page.route("**/*", handler);
  try {
    await clickStep(page, NAV.exportExcel, "Export To Excel", opts);
    // One poll loop instead of three racing waiters, so nothing keeps polling the page
    // after this slot is done (the losers of a race would otherwise run into the next slot).
    const deadline = Date.now() + 120000;
    for (;;) {
      if (captured) {
        settled = true;
        opts.log?.(`  captured the export on the wire (${captured.filename}, ${captured.body.length} bytes)`);
        return { kind: "download", body: captured.body };
      }
      if (download) {
        settled = true;
        return finishDownload(download, opts);
      }
      if (await firstVisible(page, NAV.exportQueued, 0)) {
        settled = true;
        opts.log?.("  export queued; the file will come from My Export Files");
        return { kind: "queued" };
      }
      if (Date.now() > deadline) throw new Error("nothing happened within two minutes of clicking Export To Excel");
      await page.waitForTimeout(250);
    }
  } finally {
    settled = true;
    page.off("download", onDownload);
    await page.unroute("**/*", handler).catch(() => {});
  }
}

/**
 * Whether a response is the export file rather than a page: VAN names the file in a
 * Content-Disposition attachment, or sends an Excel/CSV content type. A bare
 * octet-stream without a filename is not enough (telemetry and widgets use it too).
 */
export function looksLikeExportResponse(headers) {
  const cd = headers["content-disposition"] || "";
  const ct = headers["content-type"] || "";
  return /attachment/i.test(cd) || /ms-?excel|spreadsheet|text\/csv/i.test(ct);
}

async function finishDownload(d, opts) {
  const file = await d.path();
  if (!file) throw new Error(`the browser download failed: ${await d.failure()}`);
  opts.log?.(`  downloaded directly (${d.suggestedFilename()})`);
  return { kind: "download", body: fs.readFileSync(file) };
}

// ---- My Export Files ----

/** "ExportFileDownloadHandler.ashx?exportFileId=639…" → "639…". */
export function exportIdFrom(href) {
  return /exportFileId=(\d+)/i.exec(String(href ?? ""))?.[1] ?? null;
}

/**
 * Rows in `rows` whose id is not in `known`, newest first. Export ids are .NET
 * ticks, so a larger id is a later export.
 */
export function newExports(known, rows) {
  const seen = new Set(known);
  return rows
    .filter((r) => r.id && !seen.has(r.id))
    .sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : BigInt(b.id) < BigInt(a.id) ? -1 : 0));
}

function readExportGrid(page) {
  return page.evaluate((gridSel) => {
    const grid = document.querySelector(gridSel);
    if (!grid) return { rows: [], pages: 1 };
    const rows = [...grid.querySelectorAll("tbody tr")].map((tr) => {
      const cells = [...tr.querySelectorAll("td")].map((td) => td.innerText.trim());
      const href = tr.querySelector('a[href*="exportFileId="]')?.getAttribute("href") ?? null;
      return { file: cells[0], exported: cells[1], records: cells[3], description: cells[4], href };
    });
    const pages = Number(/(\d+)\s*Pages?/i.exec(grid.querySelector("tfoot")?.innerText ?? "")?.[1] ?? 1);
    return { rows, pages };
  }, SEL.exportGrid);
}

/**
 * Exports listed on My Export Files, each with its id. When the list spans
 * pages, sort it newest first so a fresh export lands on page one.
 */
export async function listExports(page, opts) {
  await visit(page, EXPORT_LIST_URL, (p) => signedIn(p), { ...opts, what: "My Export Files" });
  let grid = await readExportGrid(page);
  for (let i = 0; i < 2 && grid.pages > 1; i++) {
    const ids = grid.rows.map((r) => exportIdFrom(r.href)).filter(Boolean).map(BigInt);
    if (ids.length < 2 || ids[0] >= ids[ids.length - 1]) break;
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }),
      click(page.locator(SEL.exportSortByDate))
    ]);
    await settle(page);
    grid = await readExportGrid(page);
  }
  return grid.rows.map((r) => ({ ...r, id: exportIdFrom(r.href) }));
}

/** Poll My Export Files until an export not in `known` is ready to download. */
export async function waitForNewExport(page, known, opts) {
  const deadline = Date.now() + EXPORT_WAIT_MS;
  for (;;) {
    const fresh = newExports(known, await listExports(page, opts));
    if (fresh.length > 1) opts.log?.(`${fresh.length} new exports appeared; taking the newest, ${fresh[0].file}`);
    if (fresh.length) return fresh[0];
    if (Date.now() > deadline) {
      throw new Error(`export did not show up on My Export Files within ${EXPORT_WAIT_MS / 60000} min`);
    }
    await page.waitForTimeout(WAIT.exportPoll);
  }
}

/** The export's zip as a Buffer, fetched with the browser's session cookies. */
export async function downloadExport(page, exp) {
  await settle(page, WAIT.beforeDownload);
  const res = await page.context().request.get(new URL(exp.href, EXPORT_LIST_URL).href, { timeout: 120000 });
  if (!res.ok()) throw new Error(`download of ${exp.file} failed: HTTP ${res.status()}`);
  const body = await res.body();
  if (body.subarray(0, 2).toString("latin1") !== "PK") {
    throw new Error(`download of ${exp.file} is not a zip (${res.headers()["content-type"] ?? "no content type"})`);
  }
  return body;
}

/** Screenshot + HTML of the current page into `dir`, returning the paths written. */
/**
 * Where the browser was when a slot failed, as a one-line cause, or "" when nothing
 * stands out. Looks at the page itself, not the error, so it can name a sign-in that
 * lapsed mid-run or a dialog that never closed.
 */
export async function whereItStopped(page) {
  const url = (() => { try { return new URL(page.url()); } catch { return null; } })();
  if (!url) return "";
  if (/ngpvan\.com$/i.test(url.host) && /^id\./i.test(url.host)) return "the browser is on the ActionID sign-in page, so the saved sign-in has expired";
  if (/SelectCommittee/i.test(url.pathname)) return "VoteBuilder is asking which committee to open";
  const title = (await page.title().catch(() => "")).trim();
  if (/error|unavailable|maintenance/i.test(title)) return `VoteBuilder showed a page titled "${title.slice(0, 60)}"`;
  if (!(await signedIn(page))) return "the VoteBuilder sidebar is missing, so the page is not a signed-in My Voters page";
  if (await page.locator(".RadWindow, .rwWindowContent").first().isVisible().catch(() => false)) return "a VoteBuilder dialog is still open";
  return "";
}

/** True when the page text looks like a list of voters rather than counts or a form. */
export function looksLikeVoterList(text) {
  const t = String(text ?? "");
  return /\bVAN\s?ID\b/i.test(t) || (/\bFirst Name\b/i.test(t) && /\bLast Name\b/i.test(t)) || /\bDate of Birth\b|\bDOB\b/i.test(t);
}

/**
 * Save a screenshot of the failed page for troubleshooting. Only the visible part
 * of the window, never the page HTML, and nothing at all when the page shows voter
 * records or the sign-in form: those screenshots would carry personal data or the
 * sign-in hints, and the log line already says where the script stopped.
 * Returns {files, skipped} where `skipped` is the reason nothing was saved.
 */
export async function dumpFailure(page, dir, label) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const base = `${dir}/${label}-${stamp}`;
  let url = "";
  try { url = new URL(page.url()).host; } catch { /* no page */ }
  if (/^id\./i.test(url)) return { files: [], skipped: "the page is the ActionID sign-in form" };
  const text = await page.innerText("body").catch(() => "");
  if (looksLikeVoterList(text)) return { files: [], skipped: "the page shows voter records" };
  fs.mkdirSync(dir, { recursive: true });
  try {
    await page.screenshot({ path: `${base}.png`, fullPage: false });
    return { files: [`${base}.png`], skipped: "" };
  } catch {
    return { files: [], skipped: "the browser page was already gone" };
  }
}
