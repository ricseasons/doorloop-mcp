#!/usr/bin/env node
// Saves your DoorLoop web login so the server can add units and properties, which DoorLoop refuses for
// API keys. Opens a normal Chrome window (with a temporary profile) at DoorLoop's sign-in page; you sign in
// yourself, Google sign-in included. Nothing is attached to the browser while you sign in, because Google
// refuses sign-in in automated browsers. After you press Enter, the script connects, reloads DoorLoop,
// reads the login the web app uses for its own requests, checks it works, stores it in the OS keychain,
// closes Chrome and deletes the temporary profile. It never prints the login and never writes it to a file.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { chromium } from "playwright-core";

const SERVICE = "doorloop-mcp";
const ACCOUNT = "web-session";
const PORT = 9333;
const CHROME =
  process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome";

if (process.platform !== "darwin" && process.platform !== "linux") {
  console.error("Saving the web login needs the macOS Keychain or Linux secret-tool.");
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), "doorloop-login-"));
const chrome = spawn(
  CHROME,
  [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    "--no-first-run",
    "--no-default-browser-check",
    "https://app.doorloop.com/login",
  ],
  { stdio: "ignore" },
);
chrome.on("error", () => {
  console.error("Couldn't start Google Chrome. Install Chrome, then run `npm run login` again.");
  cleanup(1);
});

function cleanup(code) {
  try {
    chrome.kill();
  } catch {}
  setTimeout(() => {
    rmSync(profile, { recursive: true, force: true });
    process.exit(code);
  }, 1000);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question(
  "Sign in to DoorLoop in the Chrome window that just opened (Google sign-in is fine).\n" +
    "When you can see your DoorLoop dashboard, come back here and press Enter. ",
);
rl.close();

let session = null;
try {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes("app.doorloop.com"));
  if (!page) throw new Error("no DoorLoop tab");

  // The first successful API call the app makes with a login header after the reload.
  const captured = new Promise((resolve) => {
    page.on("response", (res) => {
      const req = res.request();
      const url = new URL(req.url());
      const authorization = req.headers()["authorization"];
      if (!authorization || !res.ok()) return;
      if (!url.hostname.endsWith("app.doorloop.com") || !url.pathname.startsWith("/api/")) return;
      resolve({ authorization, baseUrl: `${url.origin}/api` });
    });
  });
  await page.reload();
  session = await Promise.race([captured, new Promise((r) => setTimeout(() => r(null), 30000))]);
} catch {
  session = null;
}

if (!session) {
  console.error("Couldn't find a DoorLoop login in that window. Make sure you're signed in, then try again.");
  cleanup(1);
} else {
  // Check the login works outside the browser before saving it.
  const check = await fetch(`${session.baseUrl}/users/me`, {
    headers: { Authorization: session.authorization, Accept: "application/json" },
  });
  if (!check.ok) {
    console.error(`DoorLoop didn't accept the captured login (HTTP ${check.status}). Nothing saved; try again.`);
    cleanup(1);
  } else {
    // Base64 keeps the JSON's quotes out of the keychain command; stdin keeps it out of the process list.
    const secret = Buffer.from(JSON.stringify({ ...session, savedAt: new Date().toISOString() })).toString(
      "base64",
    );
    const result =
      process.platform === "darwin"
        ? spawnSync("security", ["-i"], {
            input: `add-generic-password -U -s ${SERVICE} -a ${ACCOUNT} -l "DoorLoop web login" -w "${secret}"\n`,
            stdio: ["pipe", "ignore", "inherit"],
          })
        : spawnSync(
            "secret-tool",
            ["store", "--label=DoorLoop web login", "service", SERVICE, "account", ACCOUNT],
            { input: secret, stdio: ["pipe", "inherit", "inherit"] },
          );
    if (result.status !== 0) {
      console.error("Couldn't save the login to the keychain.");
      cleanup(result.status ?? 1);
    } else {
      console.log(`Saved your DoorLoop web login for ${new URL(session.baseUrl).host}. Run this again when it expires.`);
      cleanup(0);
    }
  }
}
