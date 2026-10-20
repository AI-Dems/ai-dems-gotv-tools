/**
 * LBJ "Line Lengths by Hour" dashboard (/dashboard/recent_line_lengths).
 *
 * The exported page functions run INSIDE the page via page.evaluate(fn), so
 * each is self-contained (no imports, ES5-style). The plain helpers below
 * them run in Node.
 *
 * Selectors verified against the 2026 LBJ markup (fixtures/): one
 * <tr title="Name (Town, County)"> per location, ten per page, paged by
 * Back / Next buttons. If LBJ changes its markup, the fixtures and these
 * functions are the only things to update.
 */

/** True once the table has rows or LBJ shows its empty state. */
export function lineTableReady() {
  return !!(document.querySelector("table.dashboard-table tbody tr[title]") ||
            document.querySelector(".lbj-empty-alert"));
}

/** Rows on the current page. `headerOk` is false if "Last Reported" moved. */
export function extractLineRows() {
  var table = document.querySelector("table.dashboard-table");
  if (!table) return { headerOk: false, rows: [] };
  var heads = Array.prototype.map.call(table.querySelectorAll("thead th"), function (th) {
    return (th.getAttribute("data-slug") || th.textContent).trim();
  });
  var col = heads.indexOf("Last Reported");
  var rows = Array.prototype.slice.call(table.querySelectorAll("tbody tr")).map(function (tr) {
    var tds = tr.querySelectorAll("td");
    var a = tr.querySelector("a.dashboard-location-link");
    var href = a ? a.getAttribute("href") || "" : "";
    var id = href.match(/[?&]location=(\d+)/);
    return {
      title: (tr.getAttribute("title") || (a ? a.textContent : "")).trim(),
      sourceId: id ? id[1] : "",
      lastReported: col >= 0 && tds[col] ? tds[col].textContent.trim() : ""
    };
  }).filter(function (r) { return r.title !== ""; });
  return { headerOk: col >= 0, rows: rows };
}

/** Next-button state plus the first row's title, which changes on a page turn. */
export function linePagerState() {
  var next = Array.prototype.slice.call(document.querySelectorAll("button")).filter(function (b) {
    return b.textContent.trim() === "Next";
  })[0];
  var first = document.querySelector("table.dashboard-table tbody tr[title]");
  return {
    next: !next ? "absent" : (next.disabled ? "disabled" : "enabled"),
    firstTitle: first ? first.getAttribute("title") : ""
  };
}

/** The Date filter's text, e.g. "September 8th, 2026". */
export function lineDateFilter() {
  var el = document.querySelector(".lbj-input-date input");
  return el ? el.value.trim() : "";
}

/** The election LBJ is switched to, from the nav dropdown. */
export function currentElectionName() {
  var sel = document.querySelector(".lbj-nav select");
  if (!sel) return "";
  var opt = sel.options[sel.selectedIndex];
  return opt ? opt.textContent.trim() : "";
}

// ---- Node-side helpers -------------------------------------------------------

/** "No Line (6:12 PM)" → { wait: "No Line", time: "6:12 PM" }. "-" → null. */
export function parseLastReported(text) {
  const m = String(text || "").trim().match(/^(.*\S)\s*\((\d{1,2}:\d{2})\s*([AP]M)\)$/i);
  return m ? { wait: m[1].trim(), time: `${m[2]} ${m[3].toUpperCase()}` } : null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

/** "September 8th, 2026" → "2026-09-08", or "" when unreadable. */
export function parseFilterDate(text) {
  const m = String(text || "").trim().match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (!m) return "";
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return "";
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/**
 * One scrape → the payload the Sheet's "lines" action takes. Rows with no
 * report yet ("-") are left out but counted in locationsSeen, so the Sheet
 * still knows the location exists on the dashboard.
 */
export function buildPayload({ rows, reportDate, scrapedAt }) {
  const out = [];
  let noReport = 0;
  for (const r of rows) {
    const last = parseLastReported(r.lastReported);
    if (!last) { noReport++; continue; }
    out.push({ title: r.title, sourceId: r.sourceId, wait: last.wait, time: last.time });
  }
  return { payload: { scrapedAt: scrapedAt.toISOString(), reportDate, locationsSeen: rows.length, rows: out }, noReport };
}
