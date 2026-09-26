import type { DatabaseSync } from "node:sqlite";
import { parseRepo } from "./github.js";

/**
 * Monad Open Source Track (MOST, https://most.devnads.com): no public API, so the
 * participant applies on the site and confirms here. Credits are discretionary
 * and their size is not published, so nothing is granted automatically.
 */
export function initOpenSource(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS open_source (user_id TEXT PRIMARY KEY, repo TEXT NOT NULL, status TEXT NOT NULL, granted_micro INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_spend (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, micro INTEGER NOT NULL, request_id TEXT NOT NULL, created TEXT NOT NULL);`);
}

export function creditFor(db: DatabaseSync, userId: string) {
  const os = db
    .prepare(
      "SELECT repo,status,granted_micro FROM open_source WHERE user_id=?",
    )
    .get(userId) as
    { repo: string; status: string; granted_micro: number } | undefined;
  const spent = (
    db
      .prepare("SELECT COALESCE(SUM(micro),0) n FROM ai_spend WHERE user_id=?")
      .get(userId) as { n: number }
  ).n;
  return {
    openSource: !!os,
    status: os?.status ?? "none",
    repo: os?.repo ?? "",
    grantedMicro: os?.granted_micro ?? 0,
    spentMicro: spent,
    remainingMicro: Math.max(0, (os?.granted_micro ?? 0) - spent),
  };
}

export function recordSpend(
  db: DatabaseSync,
  id: string,
  userId: string,
  micro: number,
  requestId: string,
) {
  db.prepare("INSERT INTO ai_spend VALUES (?,?,?,?,?)").run(
    id,
    userId,
    micro,
    requestId,
    new Date().toISOString(),
  );
}

/** True when the repo is public and has a license; returns a user-facing reason otherwise. */
export async function checkPublicRepo(repoUrl: string) {
  const p = parseRepo(repoUrl);
  if (!p) return "Add a valid GitHub repo first.";
  const r = await fetch(`https://api.github.com/repos/${p.owner}/${p.name}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "buildproof",
      ...(process.env.GITHUB_TOKEN
        ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!r?.ok) return "Could not read the repo on GitHub.";
  const d = (await r.json()) as { private?: boolean; license?: unknown };
  if (d.private)
    return "Make the repo public first (GitHub → Settings → Danger zone).";
  if (!d.license) return "Add an open-source license (e.g. MIT) to the repo.";
  return null;
}
