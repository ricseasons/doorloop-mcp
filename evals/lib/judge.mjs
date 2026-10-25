// The AI judge: reads the whole run (conversation, tool calls, what DoorLoop received, files written) next
// to the skill's own instructions and the case's rubric, and says whether each point and the goal were met.
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ask } from "./claude.mjs";
import { REPO } from "./server-env.mjs";

const SCHEMA = {
  type: "object",
  properties: {
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterion: { type: "string" },
          pass: { type: "boolean" },
          evidence: { type: "string", description: "A short quote or fact from the run that decides it" },
        },
        required: ["criterion", "pass", "evidence"],
      },
    },
    goal_achieved: { type: "boolean" },
    score: { type: "integer", minimum: 1, maximum: 5, description: "5 = what a careful property manager would want" },
    summary: { type: "string", description: "Two or three sentences: what went well and what didn't" },
  },
  required: ["criteria", "goal_achieved", "score", "summary"],
};

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}… [${s.length - n} more chars]` : s);

export function judge(c, run, model) {
  const skill = readFileSync(join(REPO, "skills", c.skill, "SKILL.md"), "utf8");
  const convo = run.turns
    .map((t, i) => {
      const tools = t.toolCalls
        .map((x) => `  - ${x.name} ${clip(JSON.stringify(x.input), 1500)}\n    -> ${x.isError ? "ERROR " : ""}${clip(x.content ?? "", 800)}`)
        .join("\n");
      return `### Turn ${i}\nPERSON: ${t.user}\n\nTOOL CALLS:\n${tools || "  (none)"}\n\nASSISTANT:\n${t.text}`;
    })
    .join("\n\n");
  const writes = run.requests.filter((r) => r.method !== "GET");
  const files = Object.entries(run.files)
    .map(([p, text]) => `### ${p}\n${clip(text, 20000)}`)
    .join("\n\n");

  return ask(
    `You are grading an AI assistant that ran a DoorLoop property-management skill against a FAKE DoorLoop ` +
      `account (made-up data, nothing real was touched). The person's side was simulated from a brief. Judge the ` +
      `assistant only, strictly but fairly, from the evidence below. A criterion passes only if the run shows it.\n\n` +
      `## Goal of this case\n${c.goal}\n\n## Criteria\n${c.rubric.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\n` +
      `Return one entry per criterion, in order, with the criterion text. goal_achieved is true only if the goal ` +
      `was reached without breaking any of the skill's hard rules.\n\n` +
      `## The skill's instructions (SKILL.md)\n${skill}\n\n## The person's brief (simulated)\n${c.persona}\n\n` +
      `## Conversation\n${convo}\n\n## Writes DoorLoop received\n${writes.length ? clip(JSON.stringify(writes, null, 1), 15000) : "None."}\n\n` +
      `## Files the assistant wrote\n${files || "None."}`,
    { model, schema: SCHEMA, cwd: tmpdir() },
  );
}
