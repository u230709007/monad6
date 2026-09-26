// Evidence helpers: tamper-evident prompt chain, integrity verification and
// timeline signals that compare AI prompts with GitHub commit history.
import { createHash } from "node:crypto";

export type PromptRow = {
  id: string;
  user_id: string;
  prompt: string;
  answer: string;
  created: string;
  hash: string;
  previous: string;
  mode: string;
};

export type CommitInfo = { sha: string; date: string; message: string };

export function chainHash(r: {
  id: string;
  user: string;
  prompt: string;
  answer: string;
  created: string;
  previous: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: r.id,
        user: r.user,
        prompt: r.prompt,
        answer: r.answer,
        created: r.created,
        previous: r.previous,
      }),
    )
    .digest("hex");
}

// Rows must be in insertion order. Reports the first broken link, if any.
export function verifyChain(rows: PromptRow[]) {
  let previous = "genesis";
  for (const [i, r] of rows.entries()) {
    if (r.previous !== previous)
      return {
        valid: false,
        length: rows.length,
        brokenAt: i,
        id: r.id,
        reason: "previous hash does not match",
      };
    const expected = chainHash({ ...r, user: r.user_id });
    if (expected !== r.hash)
      return {
        valid: false,
        length: rows.length,
        brokenAt: i,
        id: r.id,
        reason: "content does not match hash",
      };
    previous = r.hash;
  }
  return { valid: true, length: rows.length, head: previous };
}

export type Signal = { level: "info" | "warn"; text: string };

// Neutral observations only. These are prompts for jury questions, never verdicts.
export function timelineSignals(
  prompts: PromptRow[],
  commits: CommitInfo[],
  baseline: { sha: string; date: string } | null,
  eventStart?: string,
): Signal[] {
  const out: Signal[] = [];
  if (!commits.length) {
    out.push({
      level: "info",
      text: "No commit history available to compare.",
    });
    return out;
  }
  const sorted = [...commits].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  if (baseline)
    out.push({
      level: "info",
      text: `Declared baseline ${baseline.sha.slice(0, 7)} is dated ${baseline.date}.`,
    });
  if (eventStart) {
    const before = sorted.filter((c) => c.date < eventStart);
    if (before.length)
      out.push({
        level: "warn",
        text: `${before.length} commit(s) predate the event start (${eventStart}); the oldest is ${first.sha.slice(0, 7)} on ${first.date}. Check whether they match the declared baseline.`,
      });
  }
  if (baseline) {
    const beyond = sorted.filter((c) => c.date <= baseline.date).length;
    if (beyond > 1)
      out.push({
        level: "info",
        text: `${beyond} commit(s) are at or before the declared baseline (existing work).`,
      });
  }
  if (prompts.length) {
    const firstPrompt = prompts[0].created;
    const after = sorted.filter((c) => c.date >= firstPrompt);
    out.push({
      level: "info",
      text: `${after.length} of ${sorted.length} commit(s) were made after the first logged AI prompt (${firstPrompt}).`,
    });
    const big = prompts.filter((p) => p.answer.length > 6000).length;
    if (big)
      out.push({
        level: "info",
        text: `${big} AI answer(s) contain more than 6,000 characters.`,
      });
  } else {
    out.push({
      level: "info",
      text: "No AI prompts logged. Work done without the assistant cannot be attributed by this tool.",
    });
  }
  return out;
}

export const ANCHOR_PATH = ".buildproof/chain-head.json";

// Content committed to the participant repo. The GitHub commit date then acts
// as a timestamp the server operator cannot rewrite after the fact.
export function anchorFile(head: string, length: number, at: string) {
  return {
    path: ANCHOR_PATH,
    content:
      JSON.stringify(
        { tool: "buildproof", head, length, anchoredAt: at },
        null,
        2,
      ) + "\n",
  };
}
