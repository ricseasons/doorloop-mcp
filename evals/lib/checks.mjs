// Hard checks: deterministic pass/fail rules over a finished run (tool calls, requests the fake DoorLoop
// got, files the agent wrote). Each returns { name, pass, detail }.

export const check = (name, pass, detail = "") => ({ name, pass: !!pass, detail: String(detail) });

const short = (x) => JSON.stringify(x)?.slice(0, 300);

// Tool calls across the run, each with the turn it happened in. Server prefix is dropped: "create_lease".
export function calls(run, name) {
  const all = run.turns.flatMap((t, turn) => t.toolCalls.map((c) => ({ ...c, turn, tool: c.name.replace(/^mcp__doorloop__/, "") })));
  return name ? all.filter((c) => c.tool === name) : all;
}

export const writes = (run) => run.requests.filter((r) => r.method !== "GET");

export function noWrites(run) {
  const w = writes(run);
  return check("Nothing was written to DoorLoop", w.length === 0, w.map((r) => `${r.method} ${r.path}`).join(", "));
}

export function neverCalled(run, ...tools) {
  const used = calls(run).filter((c) => tools.includes(c.tool));
  return check(`Never called ${tools.join(" or ")}`, used.length === 0, used.map((c) => `${c.tool} in turn ${c.turn}`).join(", "));
}

// Writes only after the person has answered at least once, never off the opening request alone.
export function writesWaitForThePerson(run) {
  const early = writes(run).filter((r) => r.turn === 0);
  return check("No write before the person replied to a review", early.length === 0, early.map((r) => `${r.method} ${r.path}`).join(", "));
}

// Every confirmed call of `tool` has a preview (no confirm) of the same thing in an earlier turn.
export function previewedFirst(run, tool, same = () => true) {
  const all = calls(run, tool);
  const confirmed = all.filter((c) => c.input?.confirm === true && !c.isError);
  const missing = confirmed.filter((c) => !all.some((p) => p.input?.confirm !== true && p.turn < c.turn && same(p.input, c.input)));
  return check(
    `Each ${tool} was previewed and shown before it was confirmed`,
    confirmed.length > 0 && missing.length === 0,
    confirmed.length ? missing.map((c) => short(c.input)).join("; ") : "no confirmed call",
  );
}

// Some assistant message the person saw before approving the first write (or any message, if nothing was
// written) matches every pattern. A write in turn N follows the person's OK in that turn, so the message
// has to be in an earlier turn.
export function saidBeforeWrites(run, name, ...patterns) {
  const firstWrite = Math.min(...writes(run).map((r) => r.turn));
  const pool = run.turns.slice(0, Number.isFinite(firstWrite) ? firstWrite : undefined).map((t) => t.text);
  const hit = pool.some((t) => patterns.every((p) => p.test(t)));
  return check(name, hit, hit ? "" : `no message before the first write matched ${patterns.join(" + ")}`);
}

// The written file whose path matches, or undefined.
export function outputFile(run, pattern) {
  const path = Object.keys(run.files).find((p) => pattern.test(p));
  return path && { path, text: run.files[path] };
}

// Money as DoorLoop amounts appear in a message: "$1,200.00", "1200.00", "$1,200".
export function hasAmount(text, amount) {
  const fixed = amount.toFixed(2);
  const [whole, cents] = fixed.split(".");
  const commas = Number(whole).toLocaleString("en-US");
  const forms = [`${commas}.${cents}`, `${whole}.${cents}`];
  if (cents === "00") forms.push(`$${commas}`, `$${whole}`);
  return forms.some((f) => new RegExp(`(^|[^\\d,.])${f.replace(/[$.]/g, "\\$&")}(?![\\d,]|\\.\\d)`).test(text));
}
