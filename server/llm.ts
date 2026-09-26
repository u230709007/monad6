import { silorailChat, silorailModel, silorailReady } from "./silorail.js";
import type { SiloResult } from "./silorail.js";

/**
 * LLM providers. Participants never handle a key in any of them:
 * - gemini: one server-side Google AI Studio key (OpenAI-compatible endpoint).
 * - silorail: keyless, the agent wallet pays per call in USDC (x402).
 * - openrouter: one server-side key funded by the Monad MOST credit; any model.
 * - mock: canned reply, no network, no cost (dev/demo).
 * SiloRail cannot be funded with OpenRouter credit (it only takes USDC), so the
 * credit is spent through the openrouter provider instead.
 */
export type Provider = "gemini" | "silorail" | "openrouter" | "mock" | "none";

export function provider(): Provider {
  const p = process.env.AI_PROVIDER;
  if (p === "gemini" || p === "silorail" || p === "openrouter" || p === "mock")
    return p;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return silorailReady() ? "silorail" : "none";
}
export const llmReady = () => provider() !== "none";
export const llmLabel = () =>
  ({
    gemini: "Gemini",
    silorail: "SiloRail",
    openrouter: "OpenRouter",
    mock: "Mock",
    none: "AI",
  })[provider()];
export const llmModel = () =>
  ({
    gemini: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    openrouter: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
    silorail: silorailModel(),
    mock: "mock",
    none: "mock",
  })[provider()];

/** Chat call against an OpenAI-compatible endpoint (OpenRouter, Gemini). */
async function openaiCompatChat(
  name: string,
  baseUrl: string,
  apiKey: string | undefined,
  messages: unknown[],
  system: string,
  extra: Record<string, unknown> = {},
): Promise<SiloResult> {
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: llmModel(),
      max_tokens: 1600,
      ...extra,
      messages: [{ role: "system", content: system }, ...messages],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) {
    console.error(`${name} error`, r.status, await r.text());
    throw new Error(`${name} could not complete the request (${r.status}).`);
  }
  const d = (await r.json()) as {
    id?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { cost?: number };
  };
  return {
    content: d.choices?.[0]?.message?.content ?? "",
    requestId: d.id ?? "",
    costMicro: Math.round((d.usage?.cost ?? 0) * 1e6),
  };
}

export async function llmChat(
  messages: unknown[],
  system: string,
): Promise<SiloResult> {
  switch (provider()) {
    case "gemini":
      return openaiCompatChat(
        "Gemini",
        process.env.GEMINI_URL ||
          "https://generativelanguage.googleapis.com/v1beta/openai",
        process.env.GEMINI_API_KEY,
        messages,
        system,
      );
    case "openrouter":
      return openaiCompatChat(
        "OpenRouter",
        process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1",
        process.env.OPENROUTER_API_KEY,
        messages,
        system,
        { usage: { include: true } },
      );
    case "silorail":
      return silorailChat(messages, system);
    case "mock":
      return {
        content:
          "[mock] AI provider is set to mock. Set AI_PROVIDER=gemini, silorail or openrouter for real replies.",
        requestId: "mock",
        costMicro: 0,
      };
    default:
      throw new Error("No AI provider is configured.");
  }
}
