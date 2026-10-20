/**
 * Client for the Sheet's web app (apps-script/Api.js). Google answers a POST
 * with a redirect to the result, which fetch follows on its own. No Google
 * credentials are involved: the token in .env is the whole handshake.
 */

const TIMEOUT_MS = 5 * 60 * 1000;

export class SheetClient {
  constructor({ url, token }, fetchFn = fetch) {
    this.url = url;
    this.token = token;
    this.fetch = fetchFn;
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
    const res = await this.fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`the Sheet did not answer "${what}" with JSON (HTTP ${res.status}). Is SYNC_URL the web app URL, deployed with access "Anyone"?`);
    }
    if (!data.ok) throw new Error(`the Sheet refused "${what}": ${data.error}`);
    return data;
  }

  ping() {
    return this.get("ping").then((d) => d.sheet);
  }

  config() {
    return this.get("config").then((d) => d.config);
  }

  /** Replace `tab` with `rows` and log the upload. */
  replace({ tab, rows, report, database, file }) {
    return this.post("replace", { tab, rows, report, database, file });
  }

  log(records) {
    return this.post("log", { records });
  }

  heartbeat(summary) {
    return this.post("heartbeat", summary ? { summary } : {});
  }
}
