import { describe, expect, it } from "vitest";
import {
  ANCHOR_PATH,
  anchorFile,
  chainHash,
  timelineSignals,
  verifyChain,
  type PromptRow,
} from "./evidence";

function chain(n: number): PromptRow[] {
  const rows: PromptRow[] = [];
  let previous = "genesis";
  for (let i = 0; i < n; i++) {
    const base = {
      id: `id${i}`,
      user_id: "u1",
      prompt: `p${i}`,
      answer: `a${i}`,
      created: `2026-01-01T00:00:0${i}Z`,
      previous,
    };
    const hash = chainHash({ ...base, user: base.user_id });
    rows.push({ ...base, hash, mode: "demo" });
    previous = hash;
  }
  return rows;
}

describe("verifyChain", () => {
  it("accepts an intact chain and reports its head", () => {
    const rows = chain(3);
    expect(verifyChain(rows)).toMatchObject({
      valid: true,
      length: 3,
      head: rows[2].hash,
    });
  });
  it("accepts an empty log", () => {
    expect(verifyChain([]).valid).toBe(true);
  });
  it("detects an edited answer", () => {
    const rows = chain(3);
    rows[1].answer = "changed";
    expect(verifyChain(rows)).toMatchObject({ valid: false, brokenAt: 1 });
  });
  it("detects a deleted row", () => {
    const rows = chain(3);
    rows.splice(1, 1);
    expect(verifyChain(rows)).toMatchObject({ valid: false, brokenAt: 1 });
  });
});

describe("timelineSignals", () => {
  const commits = [
    { sha: "a".repeat(40), date: "2025-12-01T00:00:00Z", message: "init" },
    { sha: "b".repeat(40), date: "2026-01-02T00:00:00Z", message: "feat" },
  ];
  it("flags commits before the event start", () => {
    const s = timelineSignals(chain(1), commits, null, "2026-01-01T00:00:00Z");
    expect(s.some((x) => x.level === "warn")).toBe(true);
  });
  it("handles missing commit history", () => {
    expect(timelineSignals([], [], null)[0].text).toMatch(/No commit history/);
  });
  it("never returns a verdict wording", () => {
    const text = timelineSignals(
      chain(2),
      commits,
      null,
      "2026-01-01T00:00:00Z",
    )
      .map((x) => x.text)
      .join(" ");
    expect(text).not.toMatch(/cheat|guilty/i);
  });
});

describe("anchorFile", () => {
  it("serialises head, length and time under the reserved path", () => {
    const f = anchorFile("abc", 3, "2026-01-01T00:00:00.000Z");
    expect(f.path).toBe(ANCHOR_PATH);
    expect(JSON.parse(f.content)).toEqual({
      tool: "buildproof",
      head: "abc",
      length: 3,
      anchoredAt: "2026-01-01T00:00:00.000Z",
    });
    expect(f.content.endsWith("\n")).toBe(true);
  });
});
