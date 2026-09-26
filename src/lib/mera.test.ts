import { describe, it, expect, vi } from "vitest";
import { verifyMessage, type LocalAccount } from "viem";
const state = vi.hoisted(() => ({ output: new Uint8Array(32) }));
vi.mock("@category-labs/mera", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@category-labs/mera")>();
  return {
    ...actual,
    createPasskeyWithPrfOutput: vi.fn(async () => ({
      prfOutput: state.output,
      credentialId: "test",
    })),
    getPasskeyPrfOutput: vi.fn(async () => ({
      prfOutput: state.output,
      credentialId: "test",
    })),
  };
});
import { withMera } from "./mera";
vi.stubGlobal("location", { hostname: "localhost" });
describe("Mera key lifecycle (mock ceremony, real cryptography)", () => {
  it("authenticates by a real EVM signature and wipes PRF output", async () => {
    state.output = new Uint8Array(32).fill(7);
    let retained: LocalAccount | undefined;
    await withMera(true, async (account) => {
      retained = account;
      const signature = await account.signMessage({
        message: "BuildProof nonce",
      });
      expect(
        await verifyMessage({
          address: account.address,
          message: "BuildProof nonce",
          signature,
        }),
      ).toBe(true);
      expect(state.output.every((v) => v === 0)).toBe(true);
    });
    await expect(
      retained!.signMessage({ message: "after session" }),
    ).rejects.toThrow();
  });
  it("closes the signing session after a failed action", async () => {
    state.output = new Uint8Array(32).fill(8);
    let retained: LocalAccount | undefined;
    await expect(
      withMera(false, async (account) => {
        retained = account;
        throw new Error("Rejected payment");
      }),
    ).rejects.toThrow("Rejected payment");
    expect(state.output.every((v) => v === 0)).toBe(true);
    await expect(
      retained!.signMessage({ message: "after error" }),
    ).rejects.toThrow();
  });
  it("recovers the same EVM account from the same passkey PRF output", async () => {
    state.output = new Uint8Array(32).fill(9);
    const first = await withMera(true, async (a) => a.address);
    state.output = new Uint8Array(32).fill(9);
    const second = await withMera(false, async (a) => a.address);
    expect(first).toBe(second);
  });
});
