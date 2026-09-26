import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
} from "viem";
import { monadTestnet } from "viem/chains";
import { abi } from "./escrow-abi";

export async function withMera<T>(
  create: boolean,
  action: (account: ReturnType<typeof toViemAccount>) => Promise<T>,
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
  action: "join" | "claim",
  expectedAddress: string,
  contract: Address,
) {
  return withMera(false, async (account) => {
    if (account.address.toLowerCase() !== expectedAddress.toLowerCase())
      throw new Error("Select the passkey you signed in with.");
    if ((await publicClient.getChainId()) !== monadTestnet.id)
      throw new Error("Waiting for Monad testnet connection.");
    const client = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(
        import.meta.env.VITE_MONAD_RPC_URL ||
          monadTestnet.rpcUrls.default.http[0],
      ),
    });
    const hash =
      action === "join"
        ? await client.writeContract(
            (
              await publicClient.simulateContract({
                account,
                address: contract,
                abi,
                functionName: "join",
                value: parseEther("1000"),
              })
            ).request,
          )
        : await client.writeContract(
            (
              await publicClient.simulateContract({
                account,
                address: contract,
                abi,
                functionName: "claim",
              })
            ).request,
          );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success")
      throw new Error("Transaction failed: " + hash);
    return hash;
  });
}
