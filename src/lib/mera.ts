import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { isMeraError } from "@category-labs/mera";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type LocalAccount,
} from "viem";
import { monadTestnet } from "viem/chains";
import { abi } from "./escrow-abi";

/** Wallet client for a passkey-derived Mera account. */
export function walletClientFor(account: LocalAccount) {
  return createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(
      import.meta.env.VITE_MONAD_RPC_URL ||
        monadTestnet.rpcUrls.default.http[0],
    ),
  });
}

export function friendlyError(e: unknown) {
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE")
      return "This browser/authenticator does not support passkey PRF (common with Windows Hello). Use a phone or security-key passkey.";
    if (e.code === "PASSKEY_OPERATION_FAILED")
      return "Passkey step was cancelled or is unavailable on this device.";
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

export async function withMera<T>(
  create: boolean,
  action: (account: LocalAccount) => Promise<T>,
): Promise<T> {
  const result = create
    ? await createPasskeyWithPrfOutput({
        rp: { id: location.hostname, name: "BuildProof" },
        user: { name: "Hackathon participant", displayName: "BuildProof" },
      })
    : await getPasskeyPrfOutput({ rpId: location.hostname });
  const session = createSecp256k1SigningSession({
    privateKey: result.prfOutput,
  });
  result.prfOutput.fill(0);
  try {
    return await action(toViemAccount(session));
  } finally {
    session.end();
  }
}
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(
    import.meta.env.VITE_MONAD_RPC_URL || monadTestnet.rpcUrls.default.http[0],
  ),
});
export async function escrowAction(
  action: "join" | "claim" | "withdrawRegistration",
  expectedAddress: string,
  contract: Address,
) {
  return withMera(false, async (account) => {
    if (account.address.toLowerCase() !== expectedAddress.toLowerCase())
      throw new Error("Select the passkey you signed in with.");
    if ((await publicClient.getChainId()) !== monadTestnet.id)
      throw new Error("Waiting for Monad testnet connection.");
    const client = walletClientFor(account);
    const hash =
      action === "join"
        ? await client.writeContract(
            (
              await publicClient.simulateContract({
                account,
                address: contract,
                abi,
                functionName: "join",
                // 1,000 MON stake + 100 MON attendance deposit.
                value: parseEther("1100"),
              })
            ).request,
          )
        : await client.writeContract(
            (
              await publicClient.simulateContract({
                account,
                address: contract,
                abi,
                functionName: action,
              })
            ).request,
          );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success")
      throw new Error("Transaction failed: " + hash);
    return hash;
  });
}
