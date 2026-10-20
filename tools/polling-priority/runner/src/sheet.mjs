/**
 * Client for the Sheet's web app (apps-script/Api.js). Google answers a POST
 * with a redirect to the result, which fetch follows on its own. No Google
 * credentials are involved: the token in .env is the whole handshake.
 *
 * "busy" means the Sheet's script lock was contended and nothing was written;
 * HTTP 429/5xx is Apps Script shedding load. Both clear in seconds, so a
 * couple of short retries beat failing the tick.
 */

const TIMEOUT_MS = 90_000;
export const BUSY_RETRY_MS = [3000, 8000];

export class SheetClient {
  constructor({ url, token }, fetchFn = fetch, { delays = BUSY_RETRY_MS, sleep = defaultSleep } = {}) {
    this.url = url;
    this.token = token;
    this.fetch = fetchFn;
    this.delays = delays;
    this.sleep = sleep;
  }

  async get(action) {
    const u = new URL(this.url);
    u.searchParams.set("token", this.token);
    u.searchParams.set("action", action);
    return this.#call(u, { method: "GET" }, action);
  }

  async post(action, body) {
    return this.#call(this.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: this.token, action, ...body })
    }, action);
  }

  async #call(url, init, what) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await this.fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (e) {
        if (e && (e.name === "TimeoutError" || e.name === "AbortError")) throw new Error(`the Sheet did not answer "${what}" within ${TIMEOUT_MS / 1000}s`);
        throw e;
      }
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = undefined; }
      const shed = res.status === 429 || res.status >= 500;
      const busy = shed || (data && data.ok === false && (data.error === "busy" || data.retryable === true));
      if (busy && attempt < this.delays.length) { await this.sleep(this.delays[attempt]); continue; }
      if (data === undefined) {
        throw new Error(`the Sheet did not answer "${what}" with JSON (HTTP ${res.status}). Is SHEET_URL the web app URL, deployed with access "Anyone"?`);
      }
      if (!data.ok) throw new Error(`the Sheet refused "${what}": ${data.error}`);
      return data;
    }
  }

  ping() { return this.get("ping").then((d) => d.sheet); }
  config() { return this.get("config").then((d) => d.config); }
  /** One scrape → one push of every location. */
  lines(payload) { return this.post("lines", payload); }
  heartbeat(summary) { return this.post("heartbeat", summary ? { summary } : {}); }
}

function defaultSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
