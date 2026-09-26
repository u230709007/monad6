import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createWalletClient,
  createPublicClient,
  http,
  isAddress,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
const key = process.env.DEPLOYER_PRIVATE_KEY as Hex;
if (!key) throw new Error("Set DEPLOYER_PRIVATE_KEY in .env (testnet only).");
const jurors = (process.env.JURY_ADDRESSES || "")
  .split(",")
  .map((s) => s.trim());
if (jurors.length < 3 || !jurors.every((v) => isAddress(v)))
  throw new Error("At least three distinct JURY_ADDRESSES are required.");
const treasury = process.env.TREASURY_ADDRESS;
if (!treasury || !isAddress(treasury))
  throw new Error("TREASURY_ADDRESS required.");
const start = BigInt(
  process.env.EVENT_START || Math.floor(Date.now() / 1000) + 86400,
);
const end = BigInt(process.env.EVENT_END || Number(start) + 172800);
const appeal = BigInt(process.env.APPEAL_SECONDS || 86400);
const deadline = BigInt(
  process.env.EVENT_DEADLINE || Number(end) + Number(appeal) * 5,
);
const account = privateKeyToAccount(key),
  transport = http(
    process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
  );
const publicClient = createPublicClient({ chain: monadTestnet, transport });
if ((await publicClient.getChainId()) !== 10143)
  throw new Error("Only Monad testnet deployment is supported.");
const artifact = JSON.parse(
  readFileSync("artifacts/HackathonEscrow.json", "utf8"),
);
const rulesHash = keccak256(toBytes(readFileSync("docs/RULES.md", "utf8")));
const wallet = createWalletClient({ account, chain: monadTestnet, transport });
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [
    jurors as Address[],
    treasury,
    start,
    end,
    deadline,
    appeal,
    rulesHash,
  ],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error("Deployment failed: " + hash);
const result = {
  address: receipt.contractAddress,
  hash,
  chainId: 10143,
  start: String(start),
  end: String(end),
  deadline: String(deadline),
  appeal: String(appeal),
  rulesHash,
};
writeFileSync("artifacts/deployment.json", JSON.stringify(result, null, 2));
console.log(result);
console.log(
  "Set ESCROW_ADDRESS in .env. Fund the pool separately through the organizer panel.",
);
