import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Service/account names used for the OS keychain entry.
export const KEYCHAIN_SERVICE = "doorloop-mcp";
export const KEYCHAIN_ACCOUNT = "api-key";
export const WEB_LOGIN_ACCOUNT = "web-session";

// The web app's own login, saved by `npm run web-login`, for the few endpoints API keys can't use:
// the headers (and cookies) DoorLoop needed when the person copied a request from Chrome.
export type WebLogin = { baseUrl: string; headers: Record<string, string>; savedAt: string; expiresAt?: string };

/** Reads the saved web login on each call, so a fresh `npm run web-login` is picked up without a restart. */
export function loadWebLogin(): WebLogin {
  // DOORLOOP_WEB_LOGIN is for the evals' fake DoorLoop; normal installs use the keychain.
  const raw = process.env.DOORLOOP_WEB_LOGIN?.trim() || readKeychain(WEB_LOGIN_ACCOUNT);
  if (raw) {
    try {
      const login = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as WebLogin;
      if (login.baseUrl && login.headers && Object.keys(login.headers).length) return login;
    } catch {
      // Fall through to the error below.
    }
  }
  throw new Error(
    "No DoorLoop web login saved. Run `npm run web-login` in the doorloop-mcp folder and follow the steps.",
  );
}

/**
 * Resolve the DoorLoop API key without it ever living in the repo or a plain
 * config file. Order:
 *   1. DOORLOOP_API_KEY env var (Claude Desktop injects this from its own
 *      keychain-backed storage when installed as an .mcpb extension).
 *   2. The OS keychain: macOS `security`, Linux `secret-tool`, Windows Credential
 *      Manager (through scripts/wincred.ps1).
 */
export function loadApiKey(): string {
  const fromEnv = process.env.DOORLOOP_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const fromKeychain = readKeychain(KEYCHAIN_ACCOUNT);
  if (fromKeychain) return fromKeychain;

  throw new Error(
    "DoorLoop API key not found. Install the .mcpb extension in Claude Desktop " +
      "(it asks for the key), or store it in your keychain with `npm run set-key`.",
  );
}

function readKeychain(account: string): string | undefined {
  try {
    if (process.platform === "darwin") {
      return execFileSync(
        "security",
        ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
    }
    if (process.platform === "linux") {
      return execFileSync(
        "secret-tool",
        ["lookup", "service", KEYCHAIN_SERVICE, "account", account],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
    }
    if (process.platform === "win32") {
      const script = fileURLToPath(new URL("../scripts/wincred.ps1", import.meta.url));
      return execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "read", account],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
      ).trim();
    }
  } catch {
    // Not found or tool unavailable; fall through.
  }
  return undefined;
}
