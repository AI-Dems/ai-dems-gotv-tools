// Tests for src/sheet.mjs: the runner's client for the Sheet's web app, against a fake fetch.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SheetClient } from "../src/sheet.mjs";

const URL_OK = "https://script.google.com/macros/s/ABC/exec";
const json = (body) => new Response(JSON.stringify(body));

/** A fake web app: GET ping/config need the right token; POSTs echo what they got. */
function fakeWebApp(calls) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    if (init.method === "GET") {
      const q = new URL(String(url)).searchParams;
      if (q.get("token") !== "tok") return json({ ok: false, error: "bad token" });
      return json(q.get("action") === "ping" ? { ok: true, sheet: "Test Sheet" } : { ok: true, config: { everyMin: 30 } });
    }
    const body = JSON.parse(init.body);
    return json({ ok: true, rows: body.rows?.length ?? 0, echo: body.action });
  };
}

test("ping and config are GETs carrying the token and action in the query string", async () => {
  const calls = [];
  const client = new SheetClient({ url: URL_OK, token: "tok" }, fakeWebApp(calls));
  assert.equal(await client.ping(), "Test Sheet");
  assert.deepEqual(await client.config(), { everyMin: 30 });
  assert.equal(calls[0].init.method, "GET");
  assert.equal(new URL(calls[0].url).searchParams.get("action"), "ping");
  assert.equal(new URL(calls[1].url).searchParams.get("action"), "config");
});

test("replace is a text/plain JSON POST that follows redirects", async () => {
  const calls = [];
  const client = new SheetClient({ url: URL_OK, token: "tok" }, fakeWebApp(calls));
  const result = await client.replace({ tab: "t", rows: [["a"], ["b"]], report: "R", database: "My Campaign", file: "f.xls" });
  assert.equal(result.rows, 2);
  assert.equal(result.echo, "replace");
  const { init } = calls.at(-1);
  assert.equal(init.method, "POST");
  assert.equal(init.headers["Content-Type"], "text/plain;charset=utf-8");
  assert.equal(init.redirect, "follow");
  const body = JSON.parse(init.body);
  assert.equal(body.token, "tok");
  assert.equal(body.tab, "t");
});

test("heartbeat sends the summary when given one", async () => {
  const calls = [];
  const client = new SheetClient({ url: URL_OK, token: "tok" }, fakeWebApp(calls));
  await client.heartbeat("2/2 OK");
  assert.equal(JSON.parse(calls.at(-1).init.body).summary, "2/2 OK");
  await client.heartbeat();
  assert.equal("summary" in JSON.parse(calls.at(-1).init.body), false);
});

test("an ok:false answer is raised as an error carrying the Sheet's message", async () => {
  const client = new SheetClient({ url: URL_OK, token: "wrong" }, fakeWebApp([]));
  await assert.rejects(() => client.ping(), /the Sheet refused "ping": bad token/);
});

test("an HTML answer (for example a sign-in page) is reported as not JSON", async () => {
  const client = new SheetClient({ url: URL_OK, token: "tok" }, async () => new Response("<html>Sign in</html>", { status: 200 }));
  await assert.rejects(() => client.ping(), /did not answer "ping" with JSON/);
});
