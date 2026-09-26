import "./compile.mjs";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createVM } from "@ethereumjs/vm";
import { Common, Mainnet, Hardfork } from "@ethereumjs/common";
import { createBlock } from "@ethereumjs/block";
import {
  Account,
  createAddressFromString,
  hexToBytes,
  bytesToHex,
} from "@ethereumjs/util";
import {
  encodeDeployData,
  encodeFunctionData,
  decodeFunctionResult,
  parseEther,
  keccak256,
  toBytes,
} from "viem";
const artifact = JSON.parse(
  readFileSync("artifacts/HackathonEscrow.json", "utf8"),
);
const addresses = Array.from(
  { length: 8 },
  (_, i) => "0x" + (i + 100).toString(16).padStart(40, "0"),
);
const [owner, j1, j2, j3, treasury, alice, bob, eve] = addresses;
const common = new Common({ chain: Mainnet, hardfork: Hardfork.Shanghai });
let vm,
  contract,
  time,
  checks = 0;
const hash = keccak256(toBytes("evidence"));
async function call(from, name, args = [], value = 0n, fail = false) {
  const result = await vm.evm.runCall({
    caller: createAddressFromString(from),
    to: contract,
    data: hexToBytes(
      encodeFunctionData({ abi: artifact.abi, functionName: name, args }),
    ),
    value,
    gasLimit: 10_000_000n,
    block: createBlock({ header: { timestamp: BigInt(time) } }, { common }),
  });
  if (fail)
    assert.ok(result.execResult.exceptionError, `${name} should revert`);
  else
    assert.equal(
      result.execResult.exceptionError,
      undefined,
      `${name}: ${bytesToHex(result.execResult.returnValue)}`,
    );
  checks++;
  return result;
}
async function read(name, args = []) {
  const result = await call(owner, name, args);
  return decodeFunctionResult({
    abi: artifact.abi,
    functionName: name,
    data: bytesToHex(result.execResult.returnValue),
  });
}
async function setup() {
  vm = await createVM({ common });
  time = 1000;
  for (const a of addresses)
    await vm.stateManager.putAccount(
      createAddressFromString(a),
      new Account(0n, parseEther("50000")),
    );
  const result = await vm.evm.runCall({
    caller: createAddressFromString(owner),
    data: hexToBytes(
      encodeDeployData({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args: [[j1, j2, j3], treasury, 1100n, 2000n, 3000n, 100n, hash],
      }),
    ),
    gasLimit: 15_000_000n,
    block: createBlock({ header: { timestamp: 1000n } }, { common }),
  });
  assert.equal(result.execResult.exceptionError, undefined);
  contract = result.createdAddress;
  await call(owner, "fundPrize", [], parseEther("10000"));
}
await setup();
await call(alice, "join", [], parseEther("999"), true);
await call(alice, "join", [], parseEther("1000"));
await call(alice, "join", [], parseEther("1000"), true);
await call(j1, "join", [], parseEther("1000"), true);
await call(bob, "join", [], parseEther("1000"));
await call(alice, "claim", [], 0n, true);
time = 1500;
await call(eve, "join", [], parseEther("1000"), true);
time = 2010;
await call(eve, "openCase", [alice, hash], 0n, true);
await call(j1, "openCase", [alice, hash]);
await call(j1, "voteSlash", [alice], 0n, true);
await call(alice, "appeal", [hash]);
await call(alice, "appeal", [hash], 0n, true);
time = 2120;
await call(j1, "voteSlash", [alice]);
await call(j1, "voteSlash", [alice], 0n, true);
await call(j2, "voteSlash", [alice]);
time = 2220;
await call(owner, "finalize", [[bob], [parseEther("10000")]], 0n, true);
await call(eve, "resolve", [alice]);
assert.equal(await read("stakes", [alice]), 0n);
assert.equal(await read("rewards", [treasury]), parseEther("1000"));
await call(owner, "finalize", [[alice], [parseEther("10000")]], 0n, true);
await call(owner, "finalize", [[bob], [parseEther("9999")]], 0n, true);
await call(owner, "finalize", [[bob], [parseEther("10000")]]);
await call(alice, "claim", [], 0n, true);
await call(bob, "claim");
await call(bob, "claim", [], 0n, true);
await call(treasury, "claim");
assert.equal((await vm.stateManager.getAccount(contract)).balance, 0n);
console.log(
  "PASS majority slashing, appeal window, award eligibility, full allocation, double-claim prevention",
);
await setup();
await call(alice, "join", [], parseEther("1000"));
time = 2010;
await call(j1, "openCase", [alice, hash]);
time = 2120;
await call(j1, "voteSlash", [alice]);
time = 2220;
await call(eve, "resolve", [alice]);
assert.equal(await read("stakes", [alice]), parseEther("1000"));
await call(owner, "finalize", [[alice], [parseEther("10000")]]);
await call(alice, "claim");
assert.equal((await vm.stateManager.getAccount(contract)).balance, 0n);
console.log("PASS minority vote cannot slash");
await setup();
await call(alice, "join", [], parseEther("1000"));
time = 2010;
await call(j1, "openCase", [alice, hash]);
time = 3000;
await call(alice, "claim");
await call(j1, "voteSlash", [alice], 0n, true);
await call(eve, "recoverPrize");
await call(owner, "claim");
assert.equal((await vm.stateManager.getAccount(contract)).balance, 0n);
console.log("PASS unresolved case timeout refunds and prize recovery");
await setup();
await call(alice, "join", [], parseEther("1000"));
await call(owner, "cancel");
await call(alice, "claim");
await call(owner, "claim");
await call(bob, "join", [], parseEther("1000"), true);
assert.equal((await vm.stateManager.getAccount(contract)).balance, 0n);
console.log("PASS cancellation refunds");
console.log(`${checks} EVM calls/assertions completed.`);
