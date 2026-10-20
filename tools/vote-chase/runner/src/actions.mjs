/**
 * Plain browser actions and fixed waits. The runner is ordinary browser automation
 * and makes no effort to look like a person: clicks are Playwright's stock clicks,
 * text is filled in one go, every wait is a fixed number of milliseconds chosen to
 * let VoteBuilder's pages finish loading, and passes run on an exact schedule.
 */

/** Fixed waits in milliseconds. */
export const WAIT = {
  settle: 1500,        // after a page or panel changes, before the next step
  beforeDownload: 1500,
  betweenReports: 5000,
  exportPoll: 8000
};

/** Wait a fixed number of milliseconds. */
export function settle(page, ms = WAIT.settle) {
  return page.waitForTimeout(ms);
}

/** Click a control. */
export function click(locator, { timeout } = {}) {
  return locator.click(timeout ? { timeout } : {});
}

/** Put `text` into a field, replacing what is there. */
export async function typeInto(locator, text) {
  await locator.click();
  await locator.fill(text);
}
