#!/usr/bin/env node
// Stores the DoorLoop API key in the OS keychain so it never sits in a file.
// macOS: Keychain via `security` (it prompts for the key itself).
// Linux: GNOME Keyring / KWallet via `secret-tool` (it prompts for the key itself).
import { spawnSync } from "node:child_process";

const SERVICE = "doorloop-mcp";
const ACCOUNT = "api-key";

let result;
if (process.platform === "darwin") {
  console.log("Paste your DoorLoop API key when prompted (input is hidden).");
  result = spawnSync(
    "security",
    ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-l", "DoorLoop API key", "-w"],
    { stdio: "inherit" },
  );
} else if (process.platform === "linux") {
  result = spawnSync(
    "secret-tool",
    ["store", "--label=DoorLoop API key", "service", SERVICE, "account", ACCOUNT],
    { stdio: "inherit" },
  );
} else {
  console.error("No keychain helper for this platform. Use the Claude Desktop extension instead.");
  process.exit(1);
}

if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Saved. The server will read it from your keychain at startup.");
