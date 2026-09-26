import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

/**
 * SiloRail LLM gateway: OpenAI-compatible, no API key. The server-side agent
 * wallet pays per call over x402 (USDC on Monad). The `exact` scheme is what
 * SiloRail accepts for zero-priced (":free") models; paid models need `upto`.
 */
const base = () =>
  (process.env.SILORAIL_URL || "https://testnet.silorail.com").replace(
    /\/$/,
    "",
  );
const network = () =>
  (process.env.SILORAIL_NETWORK ||
    (base().includes("mainnet")
      ? "eip155:143"
      : "eip155:10143")) as `eip155:${string}`;
// Hard ceiling per call, in micro-USD (1e-6 USD).
const maxMicro = () => BigInt(process.env.SILORAIL_MAX_MICRO_USD || "5000");

export const silorailReady = () => !!process.env.AGENT_PRIVATE_KEY;
export const silorailModel = () =>
  process.env.SILORAIL_MODEL || "google/gemma-4-31b-it:free";

let paid: typeof fetch | undefined;
function paidFetch() {
  if (paid) return paid;
  const key = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  const client = new x402Client().register(
    network(),
    new ExactEvmScheme(privateKeyToAccount(key)),
  );
  // x402 v2 rejects non-default assets (SiloRail's testnet USDC) unless allowed;
  // network and per-call amount are still enforced by the hook below.
  client.setSpendControls({ allowedAssets: true });
  client.onBeforePaymentCreation(async ({ selectedRequirements: r }) => {
    if (r.network !== network() || BigInt(r.amount) > maxMicro())
      throw new Error("SiloRail quote exceeds the allowed limit.");
  });
  return (paid = wrapFetchWithPayment(fetch, client));
}

export type SiloResult = {
  content: string;
  requestId: string;
  /** Actual cost in micro-USD (0 when the gateway did not report it). */
  costMicro: number;
};

export async function silorailChat(
  messages: unknown[],
  system: string,
): Promise<SiloResult> {
  const r = await paidFetch()(`${base()}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: silorailModel(),
      max_tokens: 1600,
      messages: [{ role: "system", content: system }, ...messages],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) {
    console.error("SiloRail error", r.status, await r.text());
    throw new Error(`SiloRail could not complete the request (${r.status}).`);
  }
  const d = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const usd = Number(r.headers.get("x-silorail-true-cost"));
  return {
    content: d.choices?.[0]?.message?.content ?? "",
    requestId: r.headers.get("x-silorail-request-id") ?? "",
    costMicro: Number.isFinite(usd) ? Math.round(usd * 1e6) : 0,
  };
}
