const BASE_URL = process.env.DOORLOOP_BASE_URL ?? "https://app.doorloop.com/api";

// DoorLoop allows roughly 50 requests/minute; stay a little under that.
const MIN_INTERVAL_MS = 1300;
const MAX_RETRIES = 3;

export type Query = Record<string, string | number | boolean | undefined>;

export class DoorLoopError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`DoorLoop API ${status}: ${body.slice(0, 500)}`);
  }
}

export class DoorLoopClient {
  private nextSlot = 0;

  constructor(private readonly apiKey: string) {}

  get<T = unknown>(path: string, query?: Query): Promise<T> {
    return this.request<T>("GET", path, query);
  }

  post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, undefined, body);
  }

  private async request<T>(method: string, path: string, query?: Query, body?: unknown): Promise<T> {
    const url = new URL(BASE_URL.replace(/\/$/, "") + "/" + path.replace(/^\//, ""));
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `bearer ${this.apiKey}`,
          Accept: "application/json",
          ...(body !== undefined && { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt * 5;
        await sleep(retryAfter * 1000);
        continue;
      }

      const text = await res.text();
      if (!res.ok) throw new DoorLoopError(res.status, text);
      return (text ? JSON.parse(text) : undefined) as T;
    }
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = this.nextSlot - now;
    this.nextSlot = Math.max(now, this.nextSlot) + MIN_INTERVAL_MS;
    if (wait > 0) await sleep(wait);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
