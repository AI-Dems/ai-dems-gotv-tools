import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { bootTime, lockHolder, parseLock, releaseLock, takeLock } from "../src/runlock.mjs";

const tmpLock = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vclock-")), "voters.lock");

test("takeLock creates the file atomically and a second taker is refused while the first lives", () => {
  const p = tmpLock();
  const alive = () => true;
  assert.equal(takeLock(p, { alive }), true);
  const { pid, boot } = parseLock(fs.readFileSync(p, "utf8"));
  assert.equal(pid, process.pid);
  assert.equal(typeof boot, "number");
  fs.writeFileSync(p, `${process.pid + 1} ${boot}`);
  assert.equal(takeLock(p, { alive }), false);
  assert.equal(lockHolder(p, { alive }), process.pid + 1);
});

test("a lock from a dead process or from before this boot is stale and gets replaced", () => {
  const p = tmpLock();
  fs.writeFileSync(p, `${process.pid + 1} ${bootTime()}`);
  assert.equal(lockHolder(p, { alive: () => false }), null);
  assert.equal(takeLock(p, { alive: () => false }), true);
  fs.writeFileSync(p, `${process.pid + 1} ${bootTime() - 86400}`);
  assert.equal(lockHolder(p, { alive: () => true }), null, "recycled PID after a reboot");
  assert.equal(takeLock(p, { alive: () => true }), true);
});

test("the older bare-PID lock format still works, and releaseLock only removes our own", () => {
  const p = tmpLock();
  fs.writeFileSync(p, `${process.pid + 1}`);
  assert.equal(lockHolder(p, { alive: () => true }), process.pid + 1);
  releaseLock(p);
  assert.equal(fs.existsSync(p), true);
  fs.writeFileSync(p, `${process.pid} ${bootTime()}`);
  releaseLock(p);
  assert.equal(fs.existsSync(p), false);
});
