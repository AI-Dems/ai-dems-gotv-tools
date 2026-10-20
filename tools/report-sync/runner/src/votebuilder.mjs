/**
 * Drives Votebuilder for one report: Report Manager → report page → Export As
 * → My Export Files → download. Every page visit also keeps the session in the
 * account's database (My Campaign or My Voters). SEL holds every selector,
 * so a Votebuilder UI change is usually a one-line fix here.
 */
import fs from "node:fs";
import { logIn, onLoginPage } from "./login.mjs";

export const BASE = "https://www.votebuilder.com";
export const REPORT_MANAGER_URL = `${BASE}/ReportManager.aspx`;
export const EXPORT_LIST_URL = `${BASE}/ExportList.aspx`;

export const SEL = {
  signedIn: "#sidebar-search-input",
  databaseTab: ".app-nav ul.nav-tabs.hide-sm a",
  reportSearch: "#reportSearch",
  allTemplatesTab: "#allSavedTemplatesLink",
  reportLink: "a.overflow-ellipsis",
  exportAs: 'button:has-text("Export As")',
  exportFormat: { csv: "#export-report-action-csv", xls: "#export-report-action-xls" },
  exportModal: "#exportModal",
  exportModalClose: "#exportModal .modal-footer button",
  exportGrid: "#ctl00_ContentPlaceHolderVANPage_gvList",
  exportSortByDate: '#ctl00_ContentPlaceHolderVANPage_gvList thead a:has-text("Exported")'
};

const EXPORT_WAIT_MS = 10 * 60 * 1000;
const EXPORT_POLL_MS = 10 * 1000;

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

/** Click the header tab for database `name` and wait until the session is in it. */
async function switchDatabase(page, name, { log }) {
  const from = await currentDatabase(page);
  // `name` is one of the two fixed database names ("My Voters" / "My Campaign") chosen by --account, escaped and anchored.
  const exact = new RegExp(`^\\s*${escapeRegExp(name)}\\s*$`); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const tab = page.locator(SEL.databaseTab).filter({ hasText: exact });
  if (!(await tab.count())) throw new Error(`no "${name}" tab in the Votebuilder header, so this account may lack access to it`);
  await tab.first().click();
  await waitFor(async () => (await currentDatabase(page)) === name, {
    timeout: 45000,
    interval: 500,
    what: `${name} to open`
  }).catch(() => {
    if (/SelectCommittee/i.test(page.url())) throw new Error(`Votebuilder asked which committee to open in ${name}`);
    throw new Error(`could not switch to ${name} (at ${page.url()})`);
  });
  log?.(`switched from ${from} to ${name}`);
}

/**
 * Open `url` and wait until `ready(page)` holds. On the way it signs in when
 * Votebuilder sends the browser to the ActionID login page, and it switches to
 * `database` when the session is in the other one.
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
      if (loggedIn) throw new Error(`still on the ActionID login page after signing in (at ${page.url()})`);
      loggedIn = true;
      await logIn(page, credentials, { log, headed });
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
    return;
  }
}

// ---- Report Manager ----

/** Every saved template the account can see, from the JSON Report Manager embeds in its page. */
function savedTemplates(page) {
  return page.evaluate(() => {
    const r = window.van?.reporting;
    if (!r?.sharedReportTemplates && !r?.myReportTemplates) return null;
    return [...(r.myReportTemplates || []), ...(r.sharedReportTemplates || [])].map((t) => ({
      name: t.name,
      link: t.link
    }));
  });
}

/** The template with this exact name (case and spacing forgiven), or null. */
export function pickTemplate(templates, name) {
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return (
    templates.find((t) => t.name === name) ||
    templates.find((t) => norm(t.name) === norm(name)) ||
    null
  );
}

/** Absolute URL of the saved report called `name`. */
export async function resolveReport(page, name, opts) {
  await visit(page, REPORT_MANAGER_URL, async (p) => (await savedTemplates(p)) !== null || signedIn(p), {
    ...opts,
    what: "Report Manager"
  });
  const templates = await savedTemplates(page);
  if (templates) {
    const hit = pickTemplate(templates, name);
    if (!hit) throw new Error(`no saved report template named "${name}" (${templates.length} visible to this account)`);
    return new URL(hit.link, BASE).href;
  }

  // The page no longer embeds the template JSON, so search the All tab instead.
  opts.log?.("template JSON missing; searching Saved Templates > All");
  await page.getByText("Saved Templates", { exact: true }).first().click();
  await page.locator(SEL.allTemplatesTab).click();
  await page.locator(SEL.reportSearch).fill(name);
  // `name` is a saved-report name from this user's own config, escaped and anchored; it runs against their own browser session.
  const exact = new RegExp(`^\\s*${escapeRegExp(name)}\\s*$`, "i"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const link = page.locator(SEL.reportLink).filter({ hasText: exact });
  await link.first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {
    throw new Error(`no saved report template named "${name}" in Saved Templates > All`);
  });
  return new URL(await link.first().getAttribute("href"), BASE).href;
}

// ---- Report page ----

/**
 * Open the report and start an export in `format` ("csv" or "xls"). Resolves
 * once Votebuilder confirms the export started.
 */
export async function exportReport(page, reportUrl, format, opts) {
  await visit(page, reportUrl, (p) => p.locator(SEL.exportAs).first().isVisible(), {
    ...opts,
    what: "the report page"
  });
  await page.locator(SEL.exportAs).first().click();
  await page.locator(SEL.exportFormat[format]).click();
  await page.locator(SEL.exportModal).waitFor({ state: "visible", timeout: 30000 }).catch(() => {
    throw new Error(`the "Export in Progress" dialog never appeared after choosing ${format}`);
  });
  await page.locator(SEL.exportModalClose).click().catch(() => {});
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
      page.locator(SEL.exportSortByDate).click()
    ]);
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
    await page.waitForTimeout(EXPORT_POLL_MS);
  }
}

/** The export's zip as a Buffer, fetched with the browser's session cookies. */
export async function downloadExport(page, exp) {
  const res = await page.context().request.get(new URL(exp.href, EXPORT_LIST_URL).href, { timeout: 120000 });
  if (!res.ok()) throw new Error(`download of ${exp.file} failed: HTTP ${res.status()}`);
  const body = await res.body();
  if (body.subarray(0, 2).toString("latin1") !== "PK") {
    throw new Error(`download of ${exp.file} is not a zip (${res.headers()["content-type"] ?? "no content type"})`);
  }
  return body;
}

/** Screenshot + HTML of the current page into `dir`, returning the paths written. */
export async function dumpFailure(page, dir, label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${dir}/${label}-${stamp}`;
  const out = [];
  fs.mkdirSync(dir, { recursive: true });
  try {
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    out.push(`${base}.png`);
  } catch { /* page may be gone */ }
  try {
    fs.writeFileSync(`${base}.html`, await page.content());
    out.push(`${base}.html`);
  } catch { /* ditto */ }
  return out;
}
