// The OS keychain entries that hold the DoorLoop API key and the web login: macOS Keychain, Linux Secret
// Service, or Windows Credential Manager. The server reads the same entries in src/auth.ts.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVICE = "doorloop-mcp";
const ACCOUNT = "api-key";
export const WEB_LOGIN_ACCOUNT = "web-session";
const WINCRED = fileURLToPath(new URL("./wincred.ps1", import.meta.url));

function wincred(action, account, opts = {}) {
  return spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", WINCRED, action, account],
    opts,
  );
}

export function keychainSupported() {
  return ["darwin", "linux", "win32"].includes(process.platform);
}

/** True if a key is saved. Never reads the key itself into this process. */
export function hasKey(account = ACCOUNT) {
  if (process.platform === "darwin") {
    return spawnSync("security", ["find-generic-password", "-s", SERVICE, "-a", account], { stdio: "ignore" }).status === 0;
  }
  if (process.platform === "linux") {
    return spawnSync("secret-tool", ["lookup", "service", SERVICE, "account", account], { stdio: "ignore" }).status === 0;
  }
  if (process.platform === "win32") return wincred("exists", account, { stdio: "ignore" }).status === 0;
  return false;
}

/** Reads a saved entry (for the web login; the server reads the API key itself). */
export function readKey(account = ACCOUNT) {
  let res;
  if (process.platform === "darwin") {
    res = spawnSync("security", ["find-generic-password", "-s", SERVICE, "-a", account, "-w"], { encoding: "utf8" });
  } else if (process.platform === "linux") {
    res = spawnSync("secret-tool", ["lookup", "service", SERVICE, "account", account], { encoding: "utf8" });
  } else if (process.platform === "win32") {
    res = wincred("read", account, { encoding: "utf8" });
  }
  return res?.status === 0 ? res.stdout.trim() : undefined;
}

/** Saves the key, replacing any saved one. Returns the helper's exit status. */
export function saveKey(key, account = ACCOUNT, label = "DoorLoop API key") {
  let result;
  if (process.platform === "darwin") {
    // The key is briefly visible to `ps` on this machine while `security` runs.
    result = spawnSync(
      "security",
      ["add-generic-password", "-U", "-s", SERVICE, "-a", account, "-l", label, "-w", key],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
  } else if (process.platform === "linux") {
    result = spawnSync("secret-tool", ["store", `--label=${label}`, "service", SERVICE, "account", account], {
      input: key,
      stdio: ["pipe", "inherit", "inherit"],
    });
  } else if (process.platform === "win32") {
    result = wincred("write", account, { input: key, stdio: ["pipe", "inherit", "inherit"] });
  } else {
    return 1;
  }
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

/** Removes the saved key. Returns true if one was removed. */
export function deleteKey(account = ACCOUNT) {
  if (process.platform === "darwin") {
    return spawnSync("security", ["delete-generic-password", "-s", SERVICE, "-a", account], { stdio: "ignore" }).status === 0;
  }
  if (process.platform === "linux") {
    return spawnSync("secret-tool", ["clear", "service", SERVICE, "account", account], { stdio: "ignore" }).status === 0;
  }
  if (process.platform === "win32") return wincred("delete", account, { stdio: "ignore" }).status === 0;
  return false;
}
