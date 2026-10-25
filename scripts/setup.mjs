#!/usr/bin/env node
// One-time setup on macOS, Windows or Linux: build, save the API key, check the connection,
// register with Claude Code and Claude Desktop, and install the skills. Safe to run again;
// finished steps are skipped, so it also updates an install after `git pull`.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hasKey, keychainSupported } from "./keychain.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WINDOWS = process.platform === "win32";
const SERVER = join(ROOT, "dist", "index.js");
const todo = [];

function step(title) {
  console.log(`\n== ${title}`);
}

// npm and claude are .cmd files on Windows, which only start through the shell.
function quote(arg) {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function run(cmd, args, opts = {}) {
  if (WINDOWS) return spawnSync([cmd, ...args].map(quote).join(" "), { cwd: ROOT, stdio: "inherit", shell: true, ...opts });
  return spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
}

function has(cmd) {
  return spawnSync(WINDOWS ? "where" : "which", [cmd], { stdio: "ignore" }).status === 0;
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

step("Checking Node.js");
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) fail(`Node.js 20 or newer is needed (you have ${process.versions.node}).`);
if (!keychainSupported()) fail("This script supports macOS, Windows and Linux.");
console.log(`Node.js ${process.versions.node}`);

step("Installing and building");
if (run("npm", ["install"]).status !== 0) fail("npm install failed.");
if (run("npm", ["run", "build"]).status !== 0) fail("Build failed.");

step("DoorLoop API key");
// Only checks that a key exists; the key itself is never printed.
if (hasKey()) {
  console.log("A key is already saved in your keychain. (Run npm run set-key to replace it.)");
} else if (!process.stdin.isTTY) {
  fail("No API key is saved yet. Run npm run set-key yourself in a terminal window, then run setup again.");
} else if (run(process.execPath, ["scripts/set-key.mjs"]).status !== 0) {
  fail("Saving the key failed.");
}

step("Checking the connection");
const { loadApiKey } = await import(pathToFileURL(join(ROOT, "dist", "auth.js")).href);
const { DoorLoopClient } = await import(pathToFileURL(join(ROOT, "dist", "client.js")).href);
try {
  const me = await new DoorLoopClient(loadApiKey()).get("/users/me");
  console.log(`Connected to DoorLoop as ${me.fullName ?? me.name ?? me.email ?? me.id}.`);
} catch (err) {
  fail(`DoorLoop didn't accept the key: ${err.message}\nRun npm run set-key to save it again, then rerun setup.`);
}

// The full path to node, so the apps find it even when it isn't on their PATH (nvm, Finder launches).
const serverConfig = { command: process.execPath, args: [SERVER] };

step("Registering with Claude Code");
if (!has("claude")) {
  console.log("Claude Code isn't installed, so this is skipped.");
} else if (run("claude", ["mcp", "get", "doorloop"], { stdio: "ignore" }).status === 0) {
  console.log('Already registered as "doorloop".');
} else if (run("claude", ["mcp", "add", "--scope", "user", "doorloop", "--", process.execPath, SERVER]).status !== 0) {
  fail("claude mcp add failed.");
}

step("Registering with Claude Desktop");
registerDesktop();

step("Installing the skills");
const skillNames = readdirSync(join(ROOT, "skills")).filter((name) => existsSync(join(ROOT, "skills", name, "SKILL.md")));
linkSkills();
zipSkills();

todo.push("For adding units: install Claude in Chrome and allow it (skills/doorloop-web-forms/SETUP.md).");
todo.push("Sign in to DoorLoop in Chrome before asking Claude to add units.");

console.log("\nSetup is done. Left to do by hand:");
for (const item of todo) console.log(`  - ${item}`);

function desktopConfigDir() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Claude");
  if (WINDOWS) {
    const roaming = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Claude");
    if (existsSync(roaming)) return roaming;
    // The Microsoft Store version keeps its settings inside its package folder.
    const packages = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Packages");
    const pkg = existsSync(packages) && readdirSync(packages).find((name) => name.startsWith("Claude_"));
    if (pkg) return join(packages, pkg, "LocalCache", "Roaming", "Claude");
    return roaming;
  }
  return undefined;
}

function registerDesktop() {
  const dir = desktopConfigDir();
  if (!dir || !existsSync(dir)) {
    console.log("Claude Desktop isn't installed, so this is skipped.");
    return;
  }
  const extensions = join(dir, "Claude Extensions");
  if (existsSync(extensions) && readdirSync(extensions).some((name) => /doorloop/i.test(name))) {
    console.log("The DoorLoop extension (.mcpb) is already installed in Claude Desktop, so this is skipped.");
    return;
  }
  const file = join(dir, "claude_desktop_config.json");
  let config = {};
  if (existsSync(file)) {
    try {
      config = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      console.log(`Couldn't read ${file}, so it was left alone.`);
      todo.push(`Claude Desktop: add "doorloop" to ${file} by hand: ${JSON.stringify(serverConfig)}`);
      return;
    }
  }
  config.mcpServers ??= {};
  const current = config.mcpServers.doorloop;
  if (current && JSON.stringify(current) === JSON.stringify(serverConfig)) {
    console.log('Already registered as "doorloop".');
    return;
  }
  if (existsSync(file)) copyFileSync(file, `${file}.bak`);
  config.mcpServers.doorloop = serverConfig;
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`${current ? "Updated" : "Added"} "doorloop" in ${file}${existsSync(`${file}.bak`) ? " (old copy saved as .bak)" : ""}.`);
  todo.push("Quit and reopen Claude Desktop so it picks up the DoorLoop server.");
}

// Claude Code reads skills from ~/.claude/skills. Links rather than copies, so a git pull updates them.
// Windows gets directory junctions, which don't need admin rights.
function linkSkills() {
  const skillsDir = join(homedir(), ".claude", "skills");
  mkdirSync(skillsDir, { recursive: true });
  for (const name of skillNames) {
    const source = join(ROOT, "skills", name);
    const target = join(skillsDir, name);
    const existing = lstatSync(target, { throwIfNoEntry: false });
    if (existing) {
      let linked = false;
      try {
        linked = existing.isSymbolicLink() && realpathSync(target) === realpathSync(source);
      } catch {
        // A broken link, e.g. to an old clone that was moved; replace it below.
        rmSync(target, { force: true });
      }
      if (linked) {
        console.log(`${name}: already in Claude Code`);
        continue;
      }
      if (existsSync(target)) {
        console.log(`${name}: left alone (something else is already at ${target})`);
        continue;
      }
    }
    symlinkSync(source, target, WINDOWS ? "junction" : "dir");
    console.log(`${name}: added to Claude Code`);
  }
}

// Claude Desktop and claude.ai take skills as uploaded zip files, one per skill folder.
function zipSkills() {
  const outDir = join(ROOT, "skill-zips");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir);
  // macOS and Windows 10+ ship bsdtar, which writes zips with -a; Linux usually has zip.
  const useZip = process.platform === "linux" && has("zip");
  for (const name of skillNames) {
    const out = join(outDir, `${name}.zip`);
    const result = useZip
      ? spawnSync("zip", ["-r", "-q", out, name], { cwd: join(ROOT, "skills"), stdio: "ignore" })
      : spawnSync("tar", ["-a", "-c", "-f", out, "-C", join(ROOT, "skills"), name], { stdio: "ignore" });
    if (result.status !== 0) {
      console.log(`Couldn't zip the skills; zip each folder in ${join(ROOT, "skills")} by hand for Claude Desktop.`);
      return;
    }
  }
  console.log(`Zipped for Claude Desktop: ${outDir}`);
  todo.push(
    `Claude Desktop: upload each zip in ${outDir} under Settings > Capabilities > Skills (upload again after an update).`,
  );
}
