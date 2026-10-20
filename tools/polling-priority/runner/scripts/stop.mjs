/** `npm stop` asks a running scraper to close its browser and exit. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lockHolder } from "../src/runlock.mjs";

const pid = lockHolder(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "logs", "runner.lock"));
if (!pid) {
  console.log("No scraper is running.");
} else {
  process.kill(pid, "SIGTERM");
  console.log(`Asked the scraper (PID ${pid}) to stop. If it was installed as a service, it will restart: run npm run service -- uninstall first.`);
}
