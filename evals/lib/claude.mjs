// Runs headless Claude Code (`claude -p`) for the agent under test, the simulated person and the judge.
import { spawn } from "node:child_process";

// Variables that tie a child `claude` to the session that started it (its transcript, messaging, memory).
// The evals run fresh, unattached sessions.
const PARENT_SESSION_VARS =
  /^(CLAUDECODE|CLAUDE_PID|CLAUDE_MEMORY_STORES|CLAUDE_COWORK_MEMORY_PATH_OVERRIDE|CLAUDE_CODE_(SESSION_ID|REMOTE_SESSION_ID|PROJECTS_SESSION|MESSAGING_SOCKET|MESSAGING_TOKEN|CHILD_SESSION|COORDINATOR_EXTRA_TOOLS|SYNC_SKILLS|SYNC_PLUGINS|SKILL_PROPOSALS|TERMINAL_MCP_TOOLS))$/;

function childEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !PARENT_SESSION_VARS.test(k)));
}

// Runs `claude -p` and returns its stream-json events.
export function claude(args, { cwd, prompt, timeoutMs = 15 * 60_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--output-format", "stream-json", "--verbose", ...args], {
      cwd,
      env: childEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const events = [];
    let buf = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          events.push(JSON.parse(line));
        } catch {
          // Not an event; ignore.
        }
      }
    });
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = events.findLast((e) => e.type === "result");
      if (!result) return reject(new Error(`claude exited ${code} without a result. ${stderr.slice(-2000)}`));
      resolve({ events, result });
    });
    child.stdin.end(prompt);
  });
}

// Pulls the readable parts out of one turn's events.
export function summarizeTurn(events) {
  const text = [];
  const toolCalls = [];
  const results = new Map();
  for (const e of events) {
    if (e.type === "assistant") {
      for (const b of e.message?.content ?? []) {
        if (b.type === "text" && b.text.trim()) text.push(b.text);
        if (b.type === "tool_use") toolCalls.push({ id: b.id, name: b.name, input: b.input });
      }
    }
    if (e.type === "user") {
      for (const b of e.message?.content ?? []) {
        if (b.type === "tool_result") {
          const content = Array.isArray(b.content)
            ? b.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n")
            : String(b.content ?? "");
          results.set(b.tool_use_id, { isError: !!b.is_error, content });
        }
      }
    }
  }
  for (const c of toolCalls) Object.assign(c, results.get(c.id) ?? {});
  const result = events.findLast((e) => e.type === "result");
  return {
    // The last text block is the reply the person sees at the end of the turn.
    reply: text.at(-1) ?? result?.result ?? "",
    text: text.join("\n\n"),
    toolCalls,
    cost: result?.total_cost_usd ?? 0,
    init: events.find((e) => e.type === "system" && e.subtype === "init"),
  };
}

// One call to Claude with no tools, for the simulated person and the judge. With a schema, returns the
// structured output.
export async function ask(prompt, { model, schema, cwd }) {
  const args = ["--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"];
  if (model) args.push("--model", model);
  if (schema) args.push("--json-schema", JSON.stringify(schema));
  const { result } = await claude(args, { cwd, prompt, timeoutMs: 5 * 60_000 });
  const value = schema ? (result.structured_output ?? JSON.parse(result.result)) : result.result;
  return { value, cost: result.total_cost_usd ?? 0 };
}
