/**
 * Loud local alerts for the person sitting at this laptop: console + bell +
 * macOS speech. Throttled per key so a stuck problem nags once per interval,
 * not once per scrape.
 */
import { spawn } from "node:child_process";

export function makeAlerter({ speak = true, throttleMs = 10 * 60 * 1000, now = Date.now } = {}) {
  const lastFired = new Map();
  return function alert(key, msg) {
    const at = now();
    console.error(`\x07[ALERT] ${new Date(at).toISOString()} ${msg}`);
    if (lastFired.has(key) && at - lastFired.get(key) < throttleMs) return false;
    lastFired.set(key, at);
    if (speak && process.platform === "darwin") {
      try {
        spawn("say", ["The line tracker needs attention"], { stdio: "ignore", detached: true }).unref();
      } catch { /* speech is best-effort */ }
    }
    return true;
  };
}
