import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
const hook: { fn?: (ctx: unknown) => Promise<void> } = {};
const spend = vi.fn();

vi.mock("@x402/fetch", () => ({
  x402Client: class {
    register() {
      return this;
    }
    setSpendControls(c: unknown) {
      spend(c);
    }
    onBeforePaymentCreation(fn: (ctx: unknown) => Promise<void>) {
      hook.fn = fn;
    }
  },
  wrapFetchWithPayment: () => fetchMock,
}));
vi.mock("@x402/evm/exact/client", () => ({ ExactEvmScheme: class {} }));

const KEY = "0x" + "11".repeat(32);

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  spend.mockReset();
  vi.stubEnv("AGENT_PRIVATE_KEY", KEY);
  vi.stubEnv("SILORAIL_URL", "");
  vi.stubEnv("SILORAIL_NETWORK", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("silorail", () => {
  it("is ready only with an agent key", async () => {
    const m = await import("./silorail");
    expect(m.silorailReady()).toBe(true);
    vi.stubEnv("AGENT_PRIVATE_KEY", "");
    expect(m.silorailReady()).toBe(false);
  });

  it("uses the configured model or a free default", async () => {
    vi.stubEnv("SILORAIL_MODEL", "");
    expect((await import("./silorail")).silorailModel()).toMatch(/:free$/);
    vi.stubEnv("SILORAIL_MODEL", "x/y");
    expect((await import("./silorail")).silorailModel()).toBe("x/y");
  });

  it("returns content, request id and cost in micro-USD", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "hi" } }] }),
        {
          headers: {
            "x-silorail-request-id": "req1",
            "x-silorail-true-cost": "0.0025",
          },
        },
      ),
    );
    const { silorailChat } = await import("./silorail");
    const r = await silorailChat([{ role: "user", content: "q" }], "sys");
    expect(r).toEqual({ content: "hi", requestId: "req1", costMicro: 2500 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://testnet.silorail.com/v1/chat/completions",
    );
  });

  it("allows the gateway's non-default asset but keeps the hook limits", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({})));
    const { silorailChat } = await import("./silorail");
    await silorailChat([], "s");
    expect(spend).toHaveBeenCalledWith({ allowedAssets: true });
  });

  it("reports zero cost and empty content when the gateway omits them", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({})));
    const { silorailChat } = await import("./silorail");
    expect(await silorailChat([], "s")).toEqual({
      content: "",
      requestId: "",
      costMicro: 0,
    });
  });

  it("throws a generic error on gateway failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response("boom", { status: 502 }));
    const { silorailChat } = await import("./silorail");
    await expect(silorailChat([], "s")).rejects.toThrow(/\(502\)/);
  });

  it("refuses quotes above the ceiling or on another network", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({})));
    const { silorailChat } = await import("./silorail");
    await silorailChat([], "s");
    const q = (network: string, amount: string) =>
      hook.fn!({ selectedRequirements: { network, amount } });
    await expect(q("eip155:10143", "5000")).resolves.toBeUndefined();
    await expect(q("eip155:10143", "5001")).rejects.toThrow(/exceeds/);
    await expect(q("eip155:143", "1")).rejects.toThrow(/exceeds/);
  });
});
