import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commitFiles,
  getCommit,
  listCommits,
  parseFileBlocks,
  parseRepo,
  safePath,
} from "./github";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parseRepo", () => {
  it("accepts plain GitHub repo URLs", () => {
    expect(parseRepo("https://github.com/acme/my-app")).toEqual({
      owner: "acme",
      name: "my-app",
    });
  });
  it("rejects other hosts, extra segments and trailing slashes", () => {
    for (const u of [
      "http://github.com/a/b",
      "https://gitlab.com/a/b",
      "https://github.com/a/b/tree/main",
      "https://github.com/a/b/",
      "",
    ])
      expect(parseRepo(u)).toBeNull();
  });
});

describe("safePath", () => {
  it("allows normal relative paths", () => {
    expect(safePath("src/app.ts")).toBe(true);
    expect(safePath(".env.example")).toBe(true);
  });
  it("blocks traversal, absolute paths, git internals, CI and secrets", () => {
    for (const p of [
      "",
      "/etc/passwd",
      "../x",
      "a/../b",
      "a//b",
      "./a",
      "a\\b",
      ".git/config",
      ".GIT/config",
      ".github/workflows/ci.yml",
      ".env",
      "sub/.env",
      ".env.local",
      "x".repeat(201),
    ])
      expect(safePath(p), p).toBe(false);
  });
});

describe("parseFileBlocks", () => {
  it("extracts files and keeps the last block for a duplicate path", () => {
    const answer =
      "text\n<<<FILE a.ts>>>\none\n<<<END>>>\n<<<FILE b.ts>>>\nb\nline\n<<<END>>>\n<<<FILE a.ts>>>\ntwo\n<<<END>>>";
    expect(parseFileBlocks(answer)).toEqual([
      { path: "a.ts", content: "two" },
      { path: "b.ts", content: "b\nline" },
    ]);
  });
  it("returns nothing when there are no blocks", () => {
    expect(parseFileBlocks("just prose")).toEqual([]);
  });
});

describe("getCommit / listCommits", () => {
  const sha = "a".repeat(40);
  it("rejects malformed SHAs without calling GitHub", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await getCommit("https://github.com/a/b", "abc")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("returns commit date and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          sha,
          commit: { author: { date: "2026-01-01T00:00:00Z" }, message: "m" },
        }),
      ),
    );
    expect(await getCommit("https://github.com/a/b", sha)).toEqual({
      sha,
      date: "2026-01-01T00:00:00Z",
      message: "m",
    });
  });
  it("returns null for an unknown commit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 404)));
    expect(await getCommit("https://github.com/a/b", sha)).toBeNull();
  });
  it("lists commits with first-line messages and [] on failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json([
          { sha, commit: { author: { date: "d" }, message: "first\nsecond" } },
        ]),
      ),
    );
    expect(await listCommits("https://github.com/a/b")).toEqual([
      { sha, date: "d", message: "first" },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)));
    expect(await listCommits("https://github.com/a/b")).toEqual([]);
  });
});

describe("commitFiles", () => {
  const repo = "https://github.com/a/b";
  it("requires a token and valid input", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    await expect(
      commitFiles(repo, [{ path: "a", content: "" }], "m"),
    ).rejects.toThrow(/GITHUB_TOKEN/);
    vi.stubEnv("GITHUB_TOKEN", "t");
    await expect(
      commitFiles("nope", [{ path: "a", content: "" }], "m"),
    ).rejects.toThrow(/valid GitHub repo/);
    await expect(commitFiles(repo, [], "m")).rejects.toThrow(/Between 1 and/);
    await expect(
      commitFiles(repo, [{ path: ".env", content: "" }], "m"),
    ).rejects.toThrow(/Path not allowed/);
    await expect(
      commitFiles(repo, [{ path: "a", content: "x".repeat(200_001) }], "m"),
    ).rejects.toThrow(/too large/);
  });
  it("creates tree and commit, then moves the branch ref", async () => {
    vi.stubEnv("GITHUB_TOKEN", "t");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(
          `${init?.method ?? "GET"} ${url.replace("https://api.github.com", "")}`,
        );
        if (url.endsWith("/repos/a/b")) return json({ default_branch: "main" });
        if (url.includes("/git/ref/")) return json({ object: { sha: "head" } });
        if (url.includes("/git/commits/head"))
          return json({ tree: { sha: "t0" } });
        if (url.endsWith("/git/trees")) return json({ sha: "t1" });
        if (url.endsWith("/git/commits")) return json({ sha: "c1" });
        return json({});
      }),
    );
    const r = await commitFiles(repo, [{ path: "a.ts", content: "x" }], "msg");
    expect(r).toEqual({ sha: "c1", url: "https://github.com/a/b/commit/c1" });
    expect(calls.at(-1)).toBe("PATCH /repos/a/b/git/refs/heads/main");
  });
  it("maps 403 to a permission message", async () => {
    vi.stubEnv("GITHUB_TOKEN", "t");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 403)));
    await expect(
      commitFiles(repo, [{ path: "a", content: "" }], "m"),
    ).rejects.toThrow(/lacks Contents: write/);
  });
});
