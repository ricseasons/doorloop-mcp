// How the evals start the real doorloop MCP server (dist/index.js) against the fake DoorLoop.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VENDOR_USERS } from "../mock/world.mjs";

export const REPO = fileURLToPath(new URL("../..", import.meta.url));
export const SERVER = join(REPO, "dist", "index.js");

// The env the server runs with. A made-up key and a localhost base URL, so nothing can reach the real
// DoorLoop even if a skill misbehaves, and the server never looks in the keychain.
export function serverEnv(mockUrl, dir) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/api$/.test(mockUrl)) throw new Error(`Refusing to run against ${mockUrl}`);
  const vendorUsers = join(dir, "vendor-users.json");
  writeFileSync(vendorUsers, JSON.stringify(VENDOR_USERS, null, 2));
  return {
    DOORLOOP_BASE_URL: mockUrl,
    DOORLOOP_API_KEY: "eval-fake-key",
    DOORLOOP_MIN_INTERVAL_MS: "0",
    DOORLOOP_VENDOR_USERS: vendorUsers,
  };
}
