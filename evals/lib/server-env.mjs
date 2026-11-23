// How the evals start the real doorloop MCP server (dist/index.js) against the fake DoorLoop.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VENDOR_USERS } from "../mock/world.mjs";

export const REPO = fileURLToPath(new URL("../..", import.meta.url));
export const SERVER = join(REPO, "dist", "index.js");

// A fake saved web login for the fake DoorLoop: `dl_web=ok` creates, `dl_web=expired` gets a 401.
export function webLogin(mockUrl, value = "ok") {
  const login = { baseUrl: mockUrl, headers: { cookie: `dl_web=${value}` }, savedAt: new Date().toISOString() };
  return Buffer.from(JSON.stringify(login)).toString("base64");
}

// The env the server runs with. A made-up key and a localhost base URL, so nothing can reach the real
// DoorLoop even if a skill misbehaves, and the server never looks in the keychain. `web` is "ok" or
// "expired" for a fake saved web login; without it the web login is deliberately unreadable, so a real one
// in the keychain is never used.
export function serverEnv(mockUrl, dir, web) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/api$/.test(mockUrl)) throw new Error(`Refusing to run against ${mockUrl}`);
  const vendorUsers = join(dir, "vendor-users.json");
  writeFileSync(vendorUsers, JSON.stringify(VENDOR_USERS, null, 2));
  return {
    DOORLOOP_BASE_URL: mockUrl,
    DOORLOOP_API_KEY: "eval-fake-key",
    DOORLOOP_MIN_INTERVAL_MS: "0",
    DOORLOOP_VENDOR_USERS: vendorUsers,
    DOORLOOP_WEB_LOGIN: web ? webLogin(mockUrl, web) : "none",
  };
}
