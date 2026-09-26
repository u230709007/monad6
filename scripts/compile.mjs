import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const source = readFileSync("contracts/HackathonEscrow.sol", "utf8");
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "HackathonEscrow.sol": { content: source } },
      settings: {
        evmVersion: "shanghai",
        optimizer: { enabled: true, runs: 200 },
        outputSelection: {
          "*": {
            "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
          },
        },
      },
    }),
  ),
);
for (const e of output.errors || []) {
  console.log(e.formattedMessage);
  if (e.severity === "error") process.exitCode = 1;
}
if (process.exitCode) process.exit(process.exitCode);
mkdirSync("artifacts", { recursive: true });
const compiled = output.contracts["HackathonEscrow.sol"].HackathonEscrow;
writeFileSync(
  "artifacts/HackathonEscrow.json",
  JSON.stringify(
    {
      abi: compiled.abi,
      bytecode: "0x" + compiled.evm.bytecode.object,
      deployedBytecode: "0x" + compiled.evm.deployedBytecode.object,
    },
    null,
    2,
  ),
);
console.log(
  "Compiled HackathonEscrow:",
  compiled.evm.bytecode.object.length / 2,
  "bytes",
);
