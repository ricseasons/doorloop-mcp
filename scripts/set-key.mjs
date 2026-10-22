#!/usr/bin/env node
// Stores the DoorLoop API key in the OS keychain so it never sits in a file.
// We read the key ourselves (hidden) because macOS's own `security ... -w` prompt
// keeps only the first 128 characters, and DoorLoop keys are longer.
import { spawnSync } from "node:child_process";
import readline from "node:readline";

const SERVICE = "doorloop-mcp";
const ACCOUNT = "api-key";

function readHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = () => {};
    process.stdout.write(prompt);
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const key = await readHidden("Paste your DoorLoop API key (input is hidden): ");
if (!key) {
  console.error("No key entered.");
  process.exit(1);
}

let result;
if (process.platform === "darwin") {
  // The key is briefly visible to `ps` on this machine while `security` runs.
  result = spawnSync(
    "security",
    ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-l", "DoorLoop API key", "-w", key],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
} else if (process.platform === "linux") {
  result = spawnSync(
    "secret-tool",
    ["store", "--label=DoorLoop API key", "service", SERVICE, "account", ACCOUNT],
    { input: key, stdio: ["pipe", "inherit", "inherit"] },
  );
} else {
  console.error("No keychain helper for this platform. Use the Claude Desktop extension instead.");
  process.exit(1);
}

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Saved (${key.length} characters). The server will read it from your keychain at startup.`);
