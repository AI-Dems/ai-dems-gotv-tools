/**
 * A PID file guarding profile/. Chromium locks that directory, so a second run
 * starting while one is live fails with an opaque error; this turns the clash
 * into a clear message and exit code. A lock left behind by a killed run names
 * a PID that is gone, and counts as free.
 */
import fs from "node:fs";

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    return err.code === "EPERM";
  }
}

/** The live PID holding `lockPath`, or null when it is free, stale or ours. */
export function lockHolder(lockPath, { alive = isAlive } = {}) {
  let pid = null;
  try {
    pid = Number(fs.readFileSync(lockPath, "utf8").trim()) || null;
  } catch {
    return null;
  }
  if (!pid || pid === process.pid) return null;
  return alive(pid) ? pid : null;
}

export function takeLock(lockPath) {
  fs.writeFileSync(lockPath, String(process.pid));
}

/** Drop the lock, but only when it is still ours to drop. */
export function releaseLock(lockPath) {
  try {
    if (Number(fs.readFileSync(lockPath, "utf8").trim()) === process.pid) fs.unlinkSync(lockPath);
  } catch { /* already gone */ }
}
