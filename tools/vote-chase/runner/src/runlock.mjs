/**
 * A lock file guarding profile/. Chromium locks that directory, so a second run
 * starting while one is live fails with an opaque error; this turns the clash
 * into a clear message and exit code. The file holds "<pid> <boot time>" so a
 * lock left behind by a killed run counts as free when its process is gone, and
 * also after a reboot, when the old PID may belong to some unrelated program.
 * The file is created with the "wx" flag, so two runs starting in the same
 * second cannot both believe they own it.
 */
import fs from "node:fs";
import os from "node:os";

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    return err.code === "EPERM";
  }
}

/** Seconds since the epoch at which this machine booted, to the nearest minute. */
export function bootTime(now = Date.now(), uptime = os.uptime()) {
  return Math.round((now / 1000 - uptime) / 60) * 60;
}

/** Parse "<pid> <boot>" (or the older bare "<pid>"). */
export function parseLock(text) {
  const [pid, boot] = String(text ?? "").trim().split(/\s+/).map(Number);
  return { pid: pid || null, boot: Number.isFinite(boot) ? boot : null };
}

/** The live PID holding `lockPath`, or null when it is free, stale or ours. */
export function lockHolder(lockPath, { alive = isAlive, boot = bootTime() } = {}) {
  let text;
  try {
    text = fs.readFileSync(lockPath, "utf8");
  } catch {
    return null;
  }
  const lock = parseLock(text);
  if (!lock.pid || lock.pid === process.pid) return null;
  // Written before this boot: the process is gone whatever its PID now points at.
  if (lock.boot != null && Math.abs(lock.boot - boot) > 120) return null;
  return alive(lock.pid) ? lock.pid : null;
}

/** Take the lock. Returns false when another run created it first. */
export function takeLock(lockPath, { alive = isAlive, boot = bootTime() } = {}) {
  const body = `${process.pid} ${boot}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lockPath, body, { flag: "wx" });
      return true;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      // A stale file (dead process or earlier boot) is removed and the write retried once.
      if (lockHolder(lockPath, { alive, boot })) return false;
      try { fs.unlinkSync(lockPath); } catch { /* someone else removed it */ }
    }
  }
  return false;
}

/** Drop the lock, but only when it is still ours to drop. */
export function releaseLock(lockPath) {
  try {
    if (parseLock(fs.readFileSync(lockPath, "utf8")).pid === process.pid) fs.unlinkSync(lockPath);
  } catch { /* already gone */ }
}
