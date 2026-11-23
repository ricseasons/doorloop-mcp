// Skill evals: runs each case's skill end to end in headless Claude Code against the fake DoorLoop, with a
// simulated person answering, then grades it with hard checks and an AI judge.
//
//   npm run eval                                    every case
//   npm run eval -- --skill doorloop-task-control   one skill
//   npm run eval -- --case lease-onboard-two --repeat 3
//
// Options: --concurrency n (default 3), --no-judge. Models: EVAL_MODEL (agent; default is Claude Code's),
// EVAL_SIM_MODEL (simulated person; default sonnet), EVAL_JUDGE_MODEL (default opus).
// This spends Claude tokens: each case is a few turns of a full agent plus a judge call.
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { ask, claude, summarizeTurn } from "./lib/claude.mjs";
import { REPO, SERVER, serverEnv } from "./lib/server-env.mjs";
import { startMock } from "./mock/server.mjs";
import { judge } from "./lib/judge.mjs";

const { values: opts } = parseArgs({
  options: {
    skill: { type: "string" },
    case: { type: "string", multiple: true },
    repeat: { type: "string", default: "1" },
    concurrency: { type: "string", default: "3" },
    "no-judge": { type: "boolean", default: false },
  },
});

const SIM_MODEL = process.env.EVAL_SIM_MODEL ?? "sonnet";
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "opus";
const AGENT_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Skill"];
const PERSON_SCHEMA = {
  type: "object",
  properties: {
    done: { type: "boolean", description: "true when the conversation is over and you would not reply" },
    message: { type: "string", description: "Your next message to the assistant, if not done" },
  },
  required: ["done", "message"],
};

const casesDir = join(REPO, "evals", "cases");
const cases = (
  await Promise.all(readdirSync(casesDir).filter((f) => f.endsWith(".mjs")).map((f) => import(join(casesDir, f))))
)
  .flatMap((m) => m.default)
  .filter((c) => (!opts.skill || c.skill === opts.skill) && (!opts.case || opts.case.includes(c.id)));
if (!cases.length) throw new Error("No cases match.");

statSync(SERVER); // Fails early if `npm run build` hasn't been run.
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outRoot = join(REPO, "evals", "results", stamp);
mkdirSync(outRoot, { recursive: true });

const jobs = cases.flatMap((c) => Array.from({ length: Number(opts.repeat) }, (_, r) => ({ c, r })));
console.log(`Running ${jobs.length} eval run(s) from ${cases.length} case(s). Results: ${relative(REPO, outRoot)}`);

const results = [];
const queue = [...jobs];
await Promise.all(
  Array.from({ length: Math.min(Number(opts.concurrency), jobs.length) }, async () => {
    for (let job; (job = queue.shift()); ) {
      const name = job.c.id + (Number(opts.repeat) > 1 ? `-r${job.r + 1}` : "");
      try {
        const res = await runCase(job.c, join(outRoot, name));
        results.push({ name, ...res });
        console.log(`${res.pass ? "PASS" : "FAIL"} ${name}  checks ${res.checksPassed}/${res.checks.length}  judge ${res.judge?.score ?? "-"}/5  $${res.cost.toFixed(2)}`);
      } catch (e) {
        results.push({ name, c: job.c, error: String(e?.stack ?? e), pass: false, checks: [], checksPassed: 0, cost: 0 });
        console.log(`ERROR ${name}: ${e?.message ?? e}`);
      }
    }
  }),
);

writeSummary(results, outRoot);

async function runCase(c, out) {
  mkdirSync(out, { recursive: true });
  const mock = await startMock();
  const work = mkdtempSync(join(tmpdir(), `doorloop-eval-${c.id}-`));
  const ws = join(work, "workspace");
  try {
    // The workspace holds only the repo's skills and the case's input files.
    cpSync(join(REPO, "skills"), join(ws, ".claude", "skills"), { recursive: true });
    for (const [to, from] of Object.entries(c.files ?? {})) {
      mkdirSync(dirname(join(ws, to)), { recursive: true });
      cpSync(join(REPO, from), join(ws, to));
    }
    const mcpConfig = join(work, "mcp.json");
    writeFileSync(
      mcpConfig,
      JSON.stringify({ mcpServers: { doorloop: { command: process.execPath, args: [SERVER], env: serverEnv(mock.url, work, c.webLogin) } } }),
    );
    const before = new Set(listFiles(ws));

    const sessionId = randomUUID();
    const baseArgs = [
      "--strict-mcp-config",
      "--mcp-config",
      mcpConfig,
      "--setting-sources",
      "project",
      "--tools",
      AGENT_TOOLS.join(","),
      "--allowedTools",
      ["mcp__doorloop", ...AGENT_TOOLS].join(","),
      ...(process.env.EVAL_MODEL ? ["--model", process.env.EVAL_MODEL] : []),
    ];

    const turns = [];
    let cost = 0;
    let message = c.prompt;
    for (let i = 0; i < (c.maxTurns ?? 8); i++) {
      mock.setTurn(i);
      const args = [...baseArgs, ...(i === 0 ? ["--session-id", sessionId] : ["--resume", sessionId])];
      let events;
      try {
        ({ events } = await claude(args, { cwd: ws, prompt: message }));
      } catch (e) {
        // Keep what happened so far, so a stuck or crashed run can be looked at.
        turns.push({ user: message, ...summarizeTurn(e.events ?? []) });
        writeFileSync(join(out, "transcript.md"), transcriptMarkdown(c, turns));
        writeFileSync(join(out, "requests.json"), JSON.stringify(mock.log, null, 2));
        throw e;
      }
      const turn = { user: message, ...summarizeTurn(events) };
      cost += turn.cost;
      if (i === 0) assertIsolated(turn.init);
      delete turn.init;
      turns.push(turn);

      const next = await simulatePerson(c, turns);
      cost += next.cost;
      if (next.value.done) break;
      message = next.value.message;
    }

    const files = Object.fromEntries(
      listFiles(ws)
        .filter((f) => !before.has(f))
        .map((f) => [f, readFileSync(join(ws, f), "utf8")]),
    );
    const run = { turns, requests: mock.log, world: mock.world, files };
    const checks = c.checks(run);
    const checksPassed = checks.filter((x) => x.pass).length;

    let verdict;
    if (!opts["no-judge"]) {
      const j = await judge(c, run, JUDGE_MODEL);
      verdict = j.value;
      cost += j.cost;
    }
    const pass = checksPassed === checks.length && (verdict ? verdict.goal_achieved : true);

    writeFileSync(join(out, "transcript.json"), JSON.stringify(turns, null, 2));
    writeFileSync(join(out, "requests.json"), JSON.stringify(mock.log, null, 2));
    writeFileSync(join(out, "checks.json"), JSON.stringify(checks, null, 2));
    if (verdict) writeFileSync(join(out, "judge.json"), JSON.stringify(verdict, null, 2));
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(dirname(join(out, "files", f)), { recursive: true });
      writeFileSync(join(out, "files", f), text);
    }
    writeFileSync(join(out, "transcript.md"), transcriptMarkdown(c, turns));
    return { c, pass, checks, checksPassed, judge: verdict, cost, turns: turns.length };
  } finally {
    await mock.close();
  }
}

// The agent must see only the fake DoorLoop server, never a real one from the person's own config.
function assertIsolated(init) {
  const servers = init?.mcp_servers ?? [];
  const ok = servers.length === 1 && servers[0].name === "doorloop" && servers[0].status === "connected";
  if (!ok) throw new Error(`Expected only the fake doorloop MCP server, got ${JSON.stringify(servers)}`);
}

function simulatePerson(c, turns) {
  const convo = turns.map((t) => `PERSON: ${t.user}\n\nASSISTANT: ${t.reply}`).join("\n\n---\n\n");
  return ask(
    `You are role-playing the person in a conversation with an AI assistant that works in their DoorLoop ` +
      `property management account. Stay in character and follow your brief exactly. Answer only what the ` +
      `assistant asked or what your brief tells you to say; don't volunteer facts the assistant didn't ask about ` +
      `unless your brief says to. Write like a busy property manager in a chat: short, plain messages.\n\n` +
      `Your brief:\n${c.persona}\n\n` +
      `Set done=true (message "") when your brief says the conversation is over, or when the assistant has ` +
      `finished and has nothing more to ask you.\n\nConversation so far:\n\n${convo}`,
    { model: SIM_MODEL, schema: PERSON_SCHEMA, cwd: tmpdir() },
  );
}

function listFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === ".claude" ? [] : listFiles(p, base);
    return [relative(base, p)];
  });
}

function transcriptMarkdown(c, turns) {
  const lines = [`# ${c.id}`, "", c.goal, ""];
  turns.forEach((t, i) => {
    lines.push(`## Turn ${i}`, "", `**Person:** ${t.user}`, "");
    for (const call of t.toolCalls) {
      lines.push(`- \`${call.name}\` ${JSON.stringify(call.input).slice(0, 400)}${call.isError ? " **(error)**" : ""}`);
    }
    lines.push("", `**Assistant:**`, "", t.text, "");
  });
  return lines.join("\n");
}

function writeSummary(results, out) {
  const bySkill = new Map();
  for (const r of results) {
    const s = bySkill.get(r.c.skill) ?? [];
    s.push(r);
    bySkill.set(r.c.skill, s);
  }
  const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "-");
  const avg = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "-");
  const lines = [
    `# DoorLoop skill evals, ${stamp}`,
    "",
    "| Skill | Runs passed | Hard checks passed | Judge score (1-5) | Goal achieved (judge) | Cost |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const [skill, rs] of bySkill) {
    const checks = rs.flatMap((r) => r.checks);
    const judged = rs.filter((r) => r.judge);
    lines.push(
      `| ${skill} | ${rs.filter((r) => r.pass).length}/${rs.length} | ${pct(checks.filter((x) => x.pass).length, checks.length)} | ` +
        `${avg(judged.map((r) => r.judge.score))} | ${judged.filter((r) => r.judge.goal_achieved).length}/${judged.length} | ` +
        `$${rs.reduce((s, r) => s + r.cost, 0).toFixed(2)} |`,
    );
  }
  lines.push("", "## Runs", "");
  for (const r of results) {
    lines.push(`### ${r.pass ? "PASS" : "FAIL"} ${r.name}`, "", r.c.goal, "");
    if (r.error) lines.push("```", r.error, "```", "");
    for (const x of r.checks) lines.push(`- ${x.pass ? "✓" : "✗"} ${x.name}${x.pass || !x.detail ? "" : `: ${x.detail}`}`);
    if (r.judge) {
      lines.push("", `Judge: ${r.judge.score}/5, goal ${r.judge.goal_achieved ? "achieved" : "not achieved"}. ${r.judge.summary}`, "");
      for (const x of r.judge.criteria) lines.push(`- ${x.pass ? "✓" : "✗"} ${x.criterion}${x.pass ? "" : `: ${x.evidence}`}`);
    }
    lines.push("");
  }
  writeFileSync(join(out, "summary.md"), lines.join("\n"));
  writeFileSync(
    join(out, "summary.json"),
    JSON.stringify(results.map(({ c, ...r }) => ({ case: c.id, skill: c.skill, ...r })), null, 2),
  );
  console.log(`\n${lines.slice(2, 4 + bySkill.size).join("\n")}\n\nFull report: ${relative(REPO, join(out, "summary.md"))}`);
  process.exitCode = results.every((r) => r.pass) ? 0 : 1;
}
