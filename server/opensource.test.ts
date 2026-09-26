import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkPublicRepo,
  creditFor,
  initOpenSource,
  recordSpend,
} from "./opensource";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

function db() {
  const d = new DatabaseSync(":memory:");
  initOpenSource(d);
  return d;
}

describe("creditFor", () => {
  it("is empty for a user who never applied", () => {
    expect(creditFor(db(), "u")).toMatchObject({
      openSource: false,
      status: "none",
      grantedMicro: 0,
      remainingMicro: 0,
    });
  });
  it("subtracts recorded spend and never goes negative", () => {
    const d = db();
    d.prepare("INSERT INTO open_source VALUES (?,?,?,?,?)").run(
      "u",
      "https://github.com/a/b",
      "approved",
      1000,
      "now",
    );
    recordSpend(d, "1", "u", 400, "r1");
    expect(creditFor(d, "u")).toMatchObject({
      spentMicro: 400,
      remainingMicro: 600,
    });
    recordSpend(d, "2", "u", 900, "r2");
    expect(creditFor(d, "u").remainingMicro).toBe(0);
  });
  it("isolates users", () => {
    const d = db();
    recordSpend(d, "1", "a", 5, "r");
    expect(creditFor(d, "b").spentMicro).toBe(0);
  });
});

describe("checkPublicRepo", () => {
  const url = "https://github.com/a/b";
  it("rejects an invalid URL without a request", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await checkPublicRepo("x")).toMatch(/valid GitHub repo/);
    expect(f).not.toHaveBeenCalled();
  });
  it("reports unreadable, private and unlicensed repos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 404)));
    expect(await checkPublicRepo(url)).toMatch(/Could not read/);
    vi.stubGlobal("fetch", vi.fn(async () => json({ private: true })));
    expect(await checkPublicRepo(url)).toMatch(/public/);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ private: false, license: null })),
    );
    expect(await checkPublicRepo(url)).toMatch(/license/);
  });
  it("returns null for a public licensed repo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ private: false, license: { key: "mit" } })),
    );
    expect(await checkPublicRepo(url)).toBeNull();
  });
  it("treats a network failure as unreadable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down"))),
    );
    expect(await checkPublicRepo(url)).toMatch(/Could not read/);
  });
});
