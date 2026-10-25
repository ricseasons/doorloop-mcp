// The OS keychain entry that holds the DoorLoop API key: macOS Keychain, Linux Secret Service,
// or Windows Credential Manager. The server reads the same entry in src/auth.ts.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVICE = "doorloop-mcp";
const ACCOUNT = "api-key";
const WINCRED = fileURLToPath(new URL("./wincred.ps1", import.meta.url));

function wincred(action, opts = {}) {
  return spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", WINCRED, action],
    opts,
  );
}

export function keychainSupported() {
  return ["darwin", "linux", "win32"].includes(process.platform);
}

/** True if a key is saved. Never reads the key itself into this process. */
export function hasKey() {
  if (process.platform === "darwin") {
    return spawnSync("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT], { stdio: "ignore" }).status === 0;
  }
  if (process.platform === "linux") {
    return spawnSync("secret-tool", ["lookup", "service", SERVICE, "account", ACCOUNT], { stdio: "ignore" }).status === 0;
  }
  if (process.platform === "win32") return wincred("exists", { stdio: "ignore" }).status === 0;
  return false;
}

/** Saves the key, replacing any saved one. Returns the helper's exit status. */
export function saveKey(key) {
  let result;
  if (process.platform === "darwin") {
    // The key is briefly visible to `ps` on this machine while `security` runs.
    result = spawnSync(
      "security",
      ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-l", "DoorLoop API key", "-w", key],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
  } else if (process.platform === "linux") {
    result = spawnSync("secret-tool", ["store", "--label=DoorLoop API key", "service", SERVICE, "account", ACCOUNT], {
      input: key,
      stdio: ["pipe", "inherit", "inherit"],
    });
  } else if (process.platform === "win32") {
    result = wincred("write", { input: key, stdio: ["pipe", "inherit", "inherit"] });
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
export function deleteKey() {
  if (process.platform === "darwin") {
    return spawnSync("security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT], { stdio: "ignore" }).status === 0;
  }
  if (process.platform === "linux") {
    return spawnSync("secret-tool", ["clear", "service", SERVICE, "account", ACCOUNT], { stdio: "ignore" }).status === 0;
  }
  if (process.platform === "win32") return wincred("delete", { stdio: "ignore" }).status === 0;
  return false;
}
