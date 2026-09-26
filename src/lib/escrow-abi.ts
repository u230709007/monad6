import { parseAbi } from "viem";
export const abi = parseAbi([
  "function join() payable",
  "function claim()",
  "function stakes(address) view returns (uint256)",
  "function joined(address) view returns (bool)",
  "function rewards(address) view returns (uint256)",
  "function start() view returns (uint256)",
  "function end() view returns (uint256)",
  "function deadline() view returns (uint256)",
  "function prizePool() view returns (uint256)",
  "function finalized() view returns (bool)",
  "function cancelled() view returns (bool)",
]);
