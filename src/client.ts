const BASE_URL = process.env.DOORLOOP_BASE_URL ?? "https://app.doorloop.com/api";

// DoorLoop allows roughly 50 requests/minute; stay a little under that. The evals' fake DoorLoop sets 0.
const MIN_INTERVAL_MS = Number(process.env.DOORLOOP_MIN_INTERVAL_MS ?? 1300);
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
  // Shared by every client, so API-key and web-login calls together stay under DoorLoop's limit.
  private static nextSlot = 0;

  // `auth` is an API key, or the web login's saved headers for the endpoints API keys can't use.
  constructor(
    private readonly auth: string | Record<string, string>,
    private readonly baseUrl: string = BASE_URL,
  ) {}

  get<T = unknown>(path: string, query?: Query): Promise<T> {
    return this.request<T>("GET", path, query);
  }

  post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, undefined, body);
  }

  put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, undefined, body);
  }

  // Sends a multipart form (e.g. a file upload); fetch sets the boundary.
  postForm<T = unknown>(path: string, form: FormData): Promise<T> {
    return this.request<T>("POST", path, undefined, form);
  }

  // Downloads a file (e.g. /files/<id>/download) as raw bytes.
  async download(path: string): Promise<{ data: Buffer; contentType: string }> {
    const res = await this.send("GET", path, undefined, undefined, "*/*");
    if (!res.ok) throw new DoorLoopError(res.status, await res.text());
    return {
      data: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  private async request<T>(method: string, path: string, query?: Query, body?: unknown): Promise<T> {
    const res = await this.send(method, path, query, body, "application/json");
    const text = await res.text();
    if (!res.ok) throw new DoorLoopError(res.status, text);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async send(method: string, path: string, query: Query | undefined, body: unknown, accept: string) {
    const url = new URL(this.baseUrl.replace(/\/$/, "") + "/" + path.replace(/^\//, ""));
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      const headers = new Headers(typeof this.auth === "string" ? { Authorization: `bearer ${this.auth}` } : this.auth);
      headers.set("Accept", accept);
      const isForm = body instanceof FormData;
      if (body !== undefined && !isForm) headers.set("Content-Type", "application/json");
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      });

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt * 5;
        await sleep(retryAfter * 1000);
        continue;
      }
      return res;
    }
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = DoorLoopClient.nextSlot - now;
    DoorLoopClient.nextSlot = Math.max(now, DoorLoopClient.nextSlot) + MIN_INTERVAL_MS;
    if (wait > 0) await sleep(wait);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
