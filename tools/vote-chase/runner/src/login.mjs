/**
 * ActionID (Auth0) sign-in for a sync account. The email and password come
 * from the account's variables in .env. Accounts with two-step sign-in work
 * too: on a --headed run the person types the one-time code in the browser
 * window, the script ticks "Remember this device", and the saved browser
 * profile carries that trust (about 30 days) into the headless runs.
 */
import { click, settle, typeInto } from "./actions.mjs";

const LOGIN_HOST = "id.ngpvan.com";

// Auth0 Lock form. Its ids start with a digit ("1-email"), so match by name.
const LOGIN = {
  email: 'input[name="email"]',
  password: 'input[name="password"]',
  submit: "button.auth0-lock-submit",
  error: ".auth0-global-message-error"
};

/** {email, password} for `account` from the environment, or null when either is missing. */
export function loadCredentials(account, env = process.env) {
  const email = String(env[account.emailVar] ?? "").trim();
  const password = String(env[account.passwordVar] ?? "");
  return email && password ? { email, password } : null;
}

export function onLoginPage(page) {
  try {
    return new URL(page.url()).host === LOGIN_HOST;
  } catch {
    return false;
  }
}

/**
 * Fill and submit the ActionID form. Throws with the reason when the login
 * does not go through. When ActionID still holds a session it sends the
 * browser straight back to Votebuilder without a form, and that counts as
 * signed in.
 */
const SECOND_STEP = {
  code: 'input[autocomplete="one-time-code"], input[name*="code" i], input[id*="code" i], input[type="tel"]',
  remember: 'input[type="checkbox"]',
  hint: /one-time (code|password)|verify your identity|authenticat/i
};
const CODE_WAIT_MS = 5 * 60 * 1000;

export async function logIn(page, { email, password }, { log, headed = false } = {}) {
  if (!onLoginPage(page)) {
    log?.("already signed in to Votebuilder; no login needed");
    return;
  }
  const box = page.locator(LOGIN.email);
  const outcome = await Promise.race([
    box.waitFor({ state: "visible", timeout: 30000 }).then(() => "form"),
    page.waitForURL((u) => u.host !== LOGIN_HOST, { timeout: 30000 }).then(() => "redirected")
  ]).catch(() => "neither");
  if (outcome === "redirected") {
    log?.("ActionID session still valid; no login needed");
    return;
  }
  if (outcome === "neither") throw new Error(`ActionID login form did not load (at ${page.url()})`);

  await settle(page);
  await typeInto(box, email);
  await typeInto(page.locator(LOGIN.password), password);
  await click(page.locator(LOGIN.submit));
  log?.("submitted the ActionID login");

  const left = await page
    .waitForURL((u) => u.host !== LOGIN_HOST, { timeout: 30000 })
    .then(() => true, () => false);
  if (left) return;

  const message = (await page.locator(LOGIN.error).innerText().catch(() => "")).trim();
  if (message) throw new Error(`ActionID rejected the login: ${message.slice(0, 120)}`);
  if (await page.locator(LOGIN.password).isVisible().catch(() => false)) {
    throw new Error("ActionID login did not go through");
  }
  // A second step: one-time code (authenticator app, text, or email).
  const codeBox = page.locator(SECOND_STEP.code).first();
  const secondStep = (await codeBox.isVisible().catch(() => false)) || SECOND_STEP.hint.test(await page.innerText("body").catch(() => ""));
  if (!secondStep) throw new Error(`ActionID did not finish signing in (at ${page.url()})`);
  const remember = page.getByLabel(/remember this (device|browser)/i).first();
  if (await remember.isVisible().catch(() => false)) {
    await remember.check().catch(() => {});
    log?.("ticked \"Remember this device\" so later runs are not asked for a code");
  }
  if (!headed) {
    throw new Error(
      "ActionID is asking for a one-time code. Run once with --headed, type the code in the browser window " +
        "and leave \"Remember this device\" ticked; the saved browser profile then stays trusted for about 30 days."
    );
  }
  log?.("ActionID is asking for a one-time code: type it in the browser window and click Continue (waiting up to 5 minutes)");
  const done = await page
    .waitForURL((u) => u.host !== LOGIN_HOST, { timeout: CODE_WAIT_MS })
    .then(() => true, () => false);
  if (!done) throw new Error("no one-time code was entered within 5 minutes");
  log?.("one-time code accepted");
}
