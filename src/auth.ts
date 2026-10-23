import { execFileSync } from "node:child_process";

// Service/account names used for the OS keychain entry.
export const KEYCHAIN_SERVICE = "doorloop-mcp";
export const KEYCHAIN_ACCOUNT = "api-key";
export const WEB_SESSION_ACCOUNT = "web-session";

// The web app's own login, saved by `npm run login`, for the few endpoints API keys can't use.
export type WebSession = { authorization: string; baseUrl: string; savedAt: string };

export function loadWebSession(): WebSession {
  const raw = readKeychain(WEB_SESSION_ACCOUNT);
  if (raw) {
    try {
      const session = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as WebSession;
      if (session.authorization && session.baseUrl) return session;
    } catch {
      // Fall through to the error below.
    }
  }
  throw new Error("No DoorLoop web login saved. Run `npm run login` in the doorloop-mcp folder and sign in.");
}

/**
 * Resolve the DoorLoop API key without it ever living in the repo or a plain
 * config file. Order:
 *   1. DOORLOOP_API_KEY env var (Claude Desktop injects this from its own
 *      keychain-backed storage when installed as an .mcpb extension).
 *   2. The OS keychain: macOS `security`, Linux `secret-tool`.
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
  } catch {
    // Not found or tool unavailable; fall through.
  }
  return undefined;
}
