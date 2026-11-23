#!/usr/bin/env node
// Saves your DoorLoop web login so the server can add units and properties, which DoorLoop refuses for
// API keys. You copy one of the web app's own requests from Chrome's DevTools ("Copy as cURL"); this
// script reads it from the clipboard, clears the clipboard, works out which headers and cookies DoorLoop
// actually needs, checks the login works outside the browser, and stores only those in the OS keychain.
// It never prints a header or cookie value, and never writes them to a file.
//   npm run web-login              reads the copied request and saves the login
//   npm run web-login -- --check   checks the saved login still works (prints no values)
//   npm run web-login -- --delete  removes the saved login
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { WEB_LOGIN_ACCOUNT, deleteKey, hasKey, keychainSupported, readKey, saveKey } from "./keychain.mjs";
import { parseCurl } from "./curl.mjs";

// Headers a browser adds that never carry a login; dropped without testing.
const BROWSER_NOISE = /^(sec-|accept-encoding$|accept-language$|cache-control$|pragma$|priority$|referer$|origin$|dnt$|upgrade-insecure-requests$|if-none-match$|if-modified-since$|content-length$)/;
const MAX_PROBES = 40;
let probes = 0;

if (!keychainSupported()) {
  console.error("No keychain helper for this platform.");
  process.exit(1);
}

const arg = process.argv[2];
if (arg === "--delete") {
  console.log(deleteKey(WEB_LOGIN_ACCOUNT) ? "Removed the saved web login." : "No saved web login to remove.");
  process.exit(0);
}
if (arg === "--check") {
  if (!hasKey(WEB_LOGIN_ACCOUNT)) {
    console.log("missing");
    process.exit(0);
  }
  const saved = JSON.parse(Buffer.from(readKey(WEB_LOGIN_ACCOUNT) ?? "", "base64").toString("utf8"));
  const status = await probe(saved.baseUrl.replace(/\/api$/, "") + saved.checkPath, saved.headers);
  console.log(status >= 200 && status < 300 ? "works" : `rejected (HTTP ${status}); run npm run web-login again`);
  if (saved.expiresAt) console.log(`Expires ${describeExpiry(saved.expiresAt)}.`);
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error("Run this yourself in a terminal window.");
  process.exit(1);
}

console.log(`Copy one request from DoorLoop in your own Chrome (you stay signed in as usual):
  1. Open DoorLoop in Chrome and go to Properties.
  2. Open DevTools (Cmd+Option+I on a Mac, F12 on Windows) and pick the Network tab, then reload the page.
  3. Type "api" in the filter box and click a request with status 200, such as "properties?...".
  4. Right-click it and choose Copy > Copy as cURL (on Windows: Copy as cURL (bash)).
Don't paste it anywhere. This script reads it from the clipboard and then clears the clipboard.`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question("\nPress Enter once you've copied it. ");
rl.close();

const copied = readClipboard();
clearClipboard();
if (!copied || !/^\s*curl\s/.test(copied)) {
  console.error("The clipboard doesn't hold a copied request. Use Copy > Copy as cURL, then run this again.");
  process.exit(1);
}

let request;
try {
  request = parseCurl(copied);
} catch (err) {
  console.error(`Couldn't read the copied request: ${err.message}`);
  process.exit(1);
}
const url = new URL(request.url);
if (!/(^|\.)app\.doorloop\.com$/.test(url.hostname) || !url.pathname.startsWith("/api/")) {
  console.error(`That request went to ${url.host}${url.pathname}, not DoorLoop's /api/. Copy one of DoorLoop's api requests.`);
  process.exit(1);
}
if (request.method !== "GET") {
  console.error(`That was a ${request.method} request. Copy one that only loads data (GET), such as properties, so checking it changes nothing.`);
  process.exit(1);
}

const all = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !BROWSER_NOISE.test(name)));
console.log(`\nChecking the login against ${url.host} (read-only, the same request Chrome made)...`);

if (!ok(await probe(url, all))) {
  console.error("DoorLoop rejected even the full copied request. Reload DoorLoop in Chrome, copy a fresh request and try again.");
  process.exit(1);
}

// The earlier login attempt sent only the Authorization header; say plainly whether that is enough.
if (all.authorization) {
  const status = await probe(url, { authorization: all.authorization, ...(all.accept && { accept: all.accept }) });
  console.log(`  Authorization header alone: ${ok(status) ? "works" : `rejected (HTTP ${status})`}`);
}

// Drop each header (and then each cookie) that DoorLoop doesn't need, one at a time.
const needed = { ...all };
for (const name of Object.keys(all)) {
  if (name === "accept" || probes >= MAX_PROBES) continue;
  const without = { ...needed };
  delete without[name];
  if (ok(await probe(url, without))) delete needed[name];
}
if (needed.cookie) {
  const cookies = splitCookies(needed.cookie);
  const keep = new Map(cookies);
  for (const [name] of cookies) {
    if (probes >= MAX_PROBES) break;
    const trial = new Map(keep);
    trial.delete(name);
    if (ok(await probe(url, { ...needed, cookie: joinCookies(trial) }))) keep.delete(name);
  }
  needed.cookie = joinCookies(keep);
  console.log(`  Cookies DoorLoop needs: ${[...keep.keys()].join(", ") || "(none)"}`);
}
console.log(`  Headers DoorLoop needs: ${Object.keys(needed).filter((n) => n !== "accept").join(", ")}`);
if (probes >= MAX_PROBES) console.log("  (Stopped trimming early to stay under DoorLoop's rate limit; kept the rest.)");

if (!ok(await probe(url, needed))) {
  console.error("The trimmed login didn't work on a final check. Nothing saved; try again.");
  process.exit(1);
}

const expiresAt = earliestExpiry(Object.values(needed));
const secret = Buffer.from(
  JSON.stringify({
    baseUrl: `${url.origin}/api`,
    checkPath: url.pathname + url.search,
    headers: needed,
    savedAt: new Date().toISOString(),
    ...(expiresAt && { expiresAt }),
  }),
).toString("base64");
const status = saveKey(secret, WEB_LOGIN_ACCOUNT, "DoorLoop web login");
if (status !== 0) process.exit(status);
console.log(`\nSaved your DoorLoop web login for ${url.host} to the keychain.`);
console.log(expiresAt ? `It expires ${describeExpiry(expiresAt)}.` : "DoorLoop didn't say when it expires; the server will tell you when it stops working.");
console.log("Run `npm run web-login` again whenever the server says the web login expired.");

async function probe(target, headers) {
  probes++;
  // Stay well under DoorLoop's ~50 requests a minute.
  await new Promise((r) => setTimeout(r, 1300));
  try {
    const res = await fetch(target, { headers, redirect: "manual" });
    await res.arrayBuffer();
    return res.status;
  } catch {
    return 0;
  }
}

function ok(status) {
  return status >= 200 && status < 300;
}

function splitCookies(header) {
  return header
    .split(/;\s*/)
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf("=");
      return i < 0 ? [pair, ""] : [pair.slice(0, i), pair.slice(i + 1)];
    });
}

function joinCookies(map) {
  return [...map].map(([k, v]) => `${k}=${v}`).join("; ");
}

// Finds JWTs in the kept values and returns the soonest `exp`, if any.
function earliestExpiry(values) {
  let soonest;
  for (const value of values) {
    for (const [token] of value.matchAll(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]*/g)) {
      try {
        const { exp } = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
        if (typeof exp === "number" && (soonest === undefined || exp < soonest)) soonest = exp;
      } catch {}
    }
  }
  return soonest === undefined ? undefined : new Date(soonest * 1000).toISOString();
}

function describeExpiry(iso) {
  const hours = (new Date(iso).getTime() - Date.now()) / 3_600_000;
  const when = new Date(iso).toLocaleString();
  if (hours < 0) return `on ${when} (already expired)`;
  return hours < 48 ? `on ${when} (in about ${Math.round(hours)} hours)` : `on ${when} (in about ${Math.round(hours / 24)} days)`;
}

function readClipboard() {
  const cmd =
    process.platform === "darwin"
      ? ["pbpaste", []]
      : process.platform === "win32"
        ? ["powershell.exe", ["-NoProfile", "-Command", "Get-Clipboard -Raw"]]
        : process.env.WAYLAND_DISPLAY
          ? ["wl-paste", []]
          : ["xclip", ["-o", "-selection", "clipboard"]];
  const res = spawnSync(cmd[0], cmd[1], { encoding: "utf8", maxBuffer: 1 << 20 });
  return res.status === 0 ? res.stdout : undefined;
}

function clearClipboard() {
  const cmd =
    process.platform === "darwin"
      ? ["pbcopy", []]
      : process.platform === "win32"
        ? ["powershell.exe", ["-NoProfile", "-Command", "Set-Clipboard -Value $null"]]
        : process.env.WAYLAND_DISPLAY
          ? ["wl-copy", ["--clear"]]
          : ["xclip", ["-selection", "clipboard"]];
  spawnSync(cmd[0], cmd[1], { input: "", stdio: ["pipe", "ignore", "ignore"] });
}
