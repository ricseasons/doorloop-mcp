#!/usr/bin/env node
// Stores the DoorLoop API key in the OS keychain so it never sits in a file.
// We read the key ourselves (hidden) because macOS's own `security ... -w` prompt
// keeps only the first 128 characters, and DoorLoop keys are longer.
//   npm run set-key              asks for the key and saves it
//   npm run set-key -- --check   prints "saved" or "missing", never the key
//   npm run set-key -- --delete  removes the saved key
import readline from "node:readline";
import { deleteKey, hasKey, keychainSupported, saveKey } from "./keychain.mjs";

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

if (!keychainSupported()) {
  console.error("No keychain helper for this platform. Use the Claude Desktop extension instead (npm run pack).");
  process.exit(1);
}

const arg = process.argv[2];
if (arg === "--check") {
  const saved = hasKey();
  console.log(saved ? "saved" : "missing");
  process.exit(0);
}
if (arg === "--delete") {
  console.log(deleteKey() ? "Removed the saved key." : "No saved key to remove.");
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error("Run this yourself in a terminal window; the key is typed into a hidden prompt.");
  process.exit(1);
}

const key = await readHidden("Paste your DoorLoop API key (input is hidden): ");
if (!key) {
  console.error("No key entered.");
  process.exit(1);
}

const status = saveKey(key);
if (status !== 0) process.exit(status);
console.log(`Saved (${key.length} characters). The server will read it from your keychain at startup.`);
