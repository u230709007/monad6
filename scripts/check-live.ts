// Preflight for APP_MODE=live: checks .env values against the real services.
// Never prints secrets. Usage: npm run check:live
import "dotenv/config";
import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const env = (k: string) => (process.env[k] || "").trim();
let failed = 0;
const ok = (m: string) => console.log(`  OK    ${m}`);
const warn = (m: string) => console.log(`  WARN  ${m}`);
const bad = (m: string) => {
  failed++;
  console.log(`  FAIL  ${m}`);
};
const section = (t: string) => console.log(`\n${t}`);
const isKey = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v);
const timeout = () => AbortSignal.timeout(15_000);

const client = createPublicClient({
  chain: monadTestnet,
  transport: http(env("MONAD_RPC_URL") || "https://testnet-rpc.monad.xyz"),
});
const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function version() view returns (string)",
]);
const gasFloor = 5n * 10n ** 17n; // 0.5 MON

async function balance(label: string, address: Address, min = gasFloor) {
  const b = await client.getBalance({ address });
  const text = `${label} ${address} holds ${formatUnits(b, 18)} MON`;
  b >= min ? ok(text) : warn(`${text} (low, get testnet MON from a faucet)`);
}

section("Mode and origin");
env("APP_MODE") === "live"
  ? ok("APP_MODE=live")
  : warn("APP_MODE is not live; the server would start in demo mode");
env("APP_ORIGIN").startsWith("http")
  ? ok(`APP_ORIGIN=${env("APP_ORIGIN")}`)
  : bad("APP_ORIGIN is missing (passkeys are bound to this origin)");

section("Monad testnet RPC");
try {
  const id = await client.getChainId();
  id === 10143 ? ok("chain id 10143") : bad(`unexpected chain id ${id}`);
} catch {
  bad("MONAD_RPC_URL is unreachable");
}

section("AI (Gemini)");
if (!env("GEMINI_API_KEY")) warn("GEMINI_API_KEY empty: Gemini provider disabled");
else {
  try {
    const r = await fetch(
      `${env("GEMINI_URL") || "https://generativelanguage.googleapis.com/v1beta/openai"}/models`,
      { headers: { authorization: `Bearer ${env("GEMINI_API_KEY")}` }, signal: timeout() },
    );
    r.ok ? ok(`Gemini key accepted (model ${env("GEMINI_MODEL") || "gemini-2.5-flash"})`) : bad(`Gemini rejected the key (HTTP ${r.status})`);
  } catch {
    bad("Gemini is unreachable");
  }
}

section("AI agent wallet (SiloRail)");
const agentKey = env("AGENT_PRIVATE_KEY");
if (!isKey(agentKey)) bad("AGENT_PRIVATE_KEY missing or not a 0x + 64 hex key");
else {
  const agent = privateKeyToAccount(agentKey as Hex).address;
  ok(`agent wallet ${agent}`);
  const usdc = "0x534b2f3A21130d7a60830c2Df862319e593943A3" as Address;
  try {
    const [b, d] = await Promise.all([
      client.readContract({
        address: usdc,
        abi: erc20,
        functionName: "balanceOf",
        args: [agent],
      }),
      client.readContract({ address: usdc, abi: erc20, functionName: "decimals" }),
    ]);
    b > 0n
      ? ok(`agent holds ${formatUnits(b, d)} testnet USDC`)
      : warn("agent has 0 testnet USDC (needed for paid models; ':free' models cost 0)");
  } catch {
    warn("could not read the agent USDC balance");
  }
}
try {
  const r = await fetch(env("SILORAIL_URL") || "https://testnet.silorail.com", {
    signal: timeout(),
  });
  ok(`SiloRail reachable (HTTP ${r.status})`);
} catch {
  bad("SiloRail is unreachable");
}

section("GitHub token");
if (!env("GITHUB_TOKEN")) warn("GITHUB_TOKEN empty: no repo context, commits or anchors");
else {
  const h = {
    authorization: `Bearer ${env("GITHUB_TOKEN")}`,
    accept: "application/vnd.github+json",
    "user-agent": "buildproof-check",
  };
  const r = await fetch("https://api.github.com/user", {
    headers: h,
    signal: timeout(),
  }).catch(() => null);
  if (!r?.ok) bad(`token rejected by GitHub (${r?.status ?? "no response"})`);
  else {
    ok(`token belongs to ${(await r.json()).login}`);
    const repo = process.argv[2]?.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/);
    if (!repo) warn("pass a repo URL to test write access: npm run check:live -- https://github.com/you/repo");
    else {
      const rr = await fetch(`https://api.github.com/repos/${repo[1]}`, {
        headers: h,
        signal: timeout(),
      }).catch(() => null);
      const d = rr?.ok ? await rr.json() : null;
      if (!d) bad(`repo ${repo[1]} not readable with this token`);
      else if (!d.permissions?.push)
        bad(`token cannot push to ${repo[1]} (needs Contents: read & write)`);
      else ok(`token can push to ${repo[1]}`);
    }
  }
}

section("x402 payments");
const facilitator = env("X402_FACILITATOR_URL");
const network = env("X402_NETWORK") || "eip155:10143";
if (!facilitator) bad("X402_FACILITATOR_URL is empty");
else {
  try {
    const r = await fetch(facilitator.replace(/\/$/, "") + "/supported", {
      signal: timeout(),
    });
    if (!r.ok) bad(`facilitator /supported answered HTTP ${r.status}`);
    else {
      const d = (await r.json()) as { kinds?: { network: string; scheme: string }[] };
      const hit = d.kinds?.some((k) => k.network === network && k.scheme === "exact");
      hit
        ? ok(`facilitator supports "exact" on ${network}`)
        : bad(`facilitator does not list "exact" on ${network}`);
    }
  } catch {
    bad("facilitator is unreachable");
  }
}
const asset = env("X402_ASSET");
if (!isAddress(asset)) bad("X402_ASSET is not an address");
else {
  try {
    const [name, version] = await Promise.all([
      client.readContract({ address: asset, abi: erc20, functionName: "name" }),
      client
        .readContract({ address: asset, abi: erc20, functionName: "version" })
        .catch(() => ""),
    ]);
    ok(`token on-chain name "${name}"${version ? `, version "${version}"` : ""}`);
    env("X402_TOKEN_NAME") === name
      ? ok("X402_TOKEN_NAME matches")
      : bad(`X402_TOKEN_NAME should be "${name}" (EIP-712 domain name)`);
    if (version && env("X402_TOKEN_VERSION") !== version)
      bad(`X402_TOKEN_VERSION should be "${version}"`);
    else if (env("X402_TOKEN_VERSION")) ok("X402_TOKEN_VERSION set");
    else bad("X402_TOKEN_VERSION is empty");
  } catch {
    bad("X402_ASSET is not a readable ERC-20 on Monad testnet");
  }
}
isAddress(env("X402_PAY_TO")) ? ok("X402_PAY_TO is an address") : bad("X402_PAY_TO is not an address");

section("Escrow contract and jury");
const jurors = env("JURY_ADDRESSES").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
jurors.length >= 3 && new Set(jurors).size === jurors.length && jurors.every((a) => isAddress(a))
  ? ok(`${jurors.length} distinct juror addresses`)
  : bad("JURY_ADDRESSES needs at least 3 distinct valid addresses");
isAddress(env("TREASURY_ADDRESS")) ? ok("TREASURY_ADDRESS is an address") : bad("TREASURY_ADDRESS is not an address");
if (!env("ESCROW_ADDRESS"))
  warn("ESCROW_ADDRESS empty: deploy from the Funds & rewards screen, then set it");
else if (!isAddress(env("ESCROW_ADDRESS"))) bad("ESCROW_ADDRESS is not an address");
else {
  const code = await client.getCode({ address: env("ESCROW_ADDRESS") as Address });
  code && code !== "0x" ? ok("ESCROW_ADDRESS has contract code") : bad("no contract code at ESCROW_ADDRESS");
}
if (isKey(env("DEPLOYER_PRIVATE_KEY")))
  await balance("deployer", privateKeyToAccount(env("DEPLOYER_PRIVATE_KEY") as Hex).address);

console.log(
  failed
    ? `\n${failed} problem(s) found. Fix them, then run this again.`
    : "\nNo blocking problems found.",
);
process.exit(failed ? 1 : 0);
