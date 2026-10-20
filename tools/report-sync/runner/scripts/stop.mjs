/**
 * `npm stop` sends SIGTERM to every running sync, and `npm stop -- voters`
 * to just that account. Each sync closes its browser and exits.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCOUNTS } from "../src/config.mjs";
import { lockHolder } from "../src/runlock.mjs";

const logs = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "logs");
const wanted = process.argv.slice(2).map((a) => a.toLowerCase());
const unknown = wanted.filter((a) => !Object.hasOwn(ACCOUNTS, a));
if (unknown.length) {
  console.error(`Unknown account ${unknown.join(", ")}. Accounts: ${Object.keys(ACCOUNTS).join(", ")}`);
  process.exit(2);
}

let stopped = 0;
for (const name of wanted.length ? wanted : Object.keys(ACCOUNTS)) {
  const pid = lockHolder(path.join(logs, `${name}.lock`));
  if (!pid) continue;
  process.kill(pid, "SIGTERM");
  console.log(`Asked the ${name} sync (PID ${pid}) to stop. It finishes once its browser closes.`);
  stopped++;
}
if (!stopped) console.log(wanted.length ? `No ${wanted.join(" or ")} sync is running.` : "No sync is running.");
