import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: {
    ...process.env,
    APP_MODE: "demo",
    DATABASE_PATH: ":memory:",
    PORT: "3002",
    APP_ORIGIN: "http://localhost:5173",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
const base = "http://127.0.0.1:3002/api";
async function request(path, body, token, expected = 200) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal(r.status, expected, path + " " + (await r.clone().text()));
  return r.json();
}
try {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(base + "/config");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.equal((await request("/config")).demo, true);
  await request("/prompts", undefined, undefined, 401);
  const account = privateKeyToAccount(generatePrivateKey());
  const c = await request("/auth/challenge", {});
  const signature = await account.signMessage({ message: c.message });
  const real = await request("/auth/verify", {
    id: c.id,
    address: account.address,
    signature,
  });
  await request(
    "/auth/verify",
    { id: c.id, address: account.address, signature },
    undefined,
    401,
  );
  const u = await request("/me", undefined, real.token);
  assert.equal(u.address, account.address.toLowerCase());
  const { token } = await request("/auth/demo", {});
  await request("/chat", { prompt: "hello" }, token, 403);
  await request(
    "/project",
    {
      name: "Test",
      team: "EVM Team",
      project: "Proof",
      repo: "https://github.com/example/proof",
      baseline: "a".repeat(40),
    },
    token,
  );
  await request("/join", {}, token);
  await request(
    "/project",
    {
      name: "Test",
      team: "EVM Team",
      project: "Proof",
      repo: "https://github.com/example/proof",
      baseline: "b".repeat(40),
    },
    token,
    409,
  );
  await request("/chat", { prompt: "" }, token, 400);
  const first = await request(
    "/chat",
    { prompt: "MVP kapsamını tanımla" },
    token,
  );
  const second = await request(
    "/chat",
    { prompt: "Sözleşme testlerini planla" },
    token,
  );
  assert.equal(second.previous, first.hash);
  assert.equal(first.mode, "demo");
  const mine = await request("/prompts", undefined, token);
  assert.equal(mine.length, 2);
  const other = await request("/auth/demo", {});
  assert.equal((await request("/prompts", undefined, other.token)).length, 0);
  const me = await request("/me", undefined, token);
  const report = await request(`/jury/${me.id}/analyze`, {}, token);
  assert.match(report.content, /DEMO RAPORU/);
  await request(
    "/appeal",
    { content: "Kaynak kod ve başlangıç commit bilgilerini inceleyin." },
    token,
  );
  const evidence = await request(`/jury/${me.id}/evidence`, undefined, token);
  assert.equal(evidence.appeals.length, 1);
  await request("/auth/logout", {}, token);
  await request("/me", undefined, token, 401);
  const denied = await fetch(base + "/auth/demo", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(denied.status, 403);
  console.log(
    "PASS API: signature login, nonce replay, session revocation, project baseline lock, registration gate, prompt validation, hash chaining, user isolation, reports, appeals, origin protection",
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  server.kill();
}
