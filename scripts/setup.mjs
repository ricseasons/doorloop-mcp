#!/usr/bin/env node
// One-time setup: build, save the API key, register with Claude Code, link the skills,
// and check the connection. Safe to run again; finished steps are skipped.
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "doorloop-mcp";
const ACCOUNT = "api-key";
const todo = [];

function step(title) {
  console.log(`\n== ${title}`);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
}

function has(cmd) {
  return spawnSync("which", [cmd], { stdio: "ignore" }).status === 0;
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

step("Checking Node.js");
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) fail(`Node.js 20 or newer is needed (you have ${process.versions.node}).`);
if (process.platform !== "darwin" && process.platform !== "linux") {
  fail("This script supports macOS and Linux. On Windows, use the Claude Desktop extension (npm run pack).");
}
console.log(`Node.js ${process.versions.node}`);

step("Installing and building");
if (run("npm", ["install"]).status !== 0) fail("npm install failed.");
if (run("npm", ["run", "build"]).status !== 0) fail("Build failed.");

step("DoorLoop API key");
// Only checks that a key exists; the key itself is never printed.
const keyFound =
  process.platform === "darwin"
    ? spawnSync("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT], { stdio: "ignore" }).status === 0
    : spawnSync("secret-tool", ["lookup", "service", SERVICE, "account", ACCOUNT], { stdio: "ignore" }).status === 0;
if (keyFound) {
  console.log("A key is already saved in your keychain. (Run npm run set-key to replace it.)");
} else if (run("node", ["scripts/set-key.mjs"]).status !== 0) {
  fail("Saving the key failed.");
}

step("Checking the connection");
const { loadApiKey } = await import(join(ROOT, "dist/auth.js"));
const { DoorLoopClient } = await import(join(ROOT, "dist/client.js"));
try {
  const me = await new DoorLoopClient(loadApiKey()).get("/users/me");
  console.log(`Connected to DoorLoop as ${me.fullName ?? me.name ?? me.email ?? me.id}.`);
} catch (err) {
  fail(`DoorLoop didn't accept the key: ${err.message}\nRun npm run set-key to save it again, then rerun setup.`);
}

step("Registering with Claude Code");
if (!has("claude")) {
  console.log("Claude Code isn't installed, so this is skipped.");
  todo.push("Claude Desktop instead? Run npm run pack and double-click doorloop-mcp.mcpb.");
} else if (spawnSync("claude", ["mcp", "get", "doorloop"], { stdio: "ignore" }).status === 0) {
  console.log("Already registered as \"doorloop\".");
} else if (
  run("claude", ["mcp", "add", "--scope", "user", "doorloop", "--", "node", join(ROOT, "dist/index.js")]).status !== 0
) {
  fail("claude mcp add failed.");
}

step("Linking the skills");
// Links rather than copies, so a git pull updates the skills too.
const skillsDir = join(homedir(), ".claude", "skills");
mkdirSync(skillsDir, { recursive: true });
for (const name of readdirSync(join(ROOT, "skills"))) {
  const source = join(ROOT, "skills", name);
  const target = join(skillsDir, name);
  if (lstatSync(target, { throwIfNoEntry: false })) {
    const linked = lstatSync(target).isSymbolicLink() && readlinkSync(target) === source;
    console.log(linked ? `${name}: already linked` : `${name}: left alone (something else is already at ${target})`);
    continue;
  }
  symlinkSync(source, target, "dir");
  console.log(`${name}: linked`);
}
todo.push("Claude Desktop: add the skills under Settings > Capabilities > Skills (zip each folder in skills/).");

todo.push("For adding units: install Claude in Chrome and allow it (skills/doorloop-web-forms/SETUP.md).");
todo.push("Sign in to DoorLoop in Chrome before asking Claude to add units.");

console.log("\nSetup is done. Left to do by hand:");
for (const item of todo) console.log(`  - ${item}`);
