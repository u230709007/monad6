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
  { length: 11 },
  (_, i) => "0x" + (i + 100).toString(16).padStart(40, "0"),
);
const [owner, j1, j2, j3, treasury, alice, bob, eve, carol, dave, frank] =
  addresses;
const ENTRY = parseEther("1100");
const balance = async (a) =>
  (await vm.stateManager.getAccount(createAddressFromString(a))).balance;
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
async function setup(capacity = 10n) {
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
        args: [
          [j1, j2, j3],
          treasury,
          1100n,
          2000n,
          3000n,
          100n,
          hash,
          capacity,
        ],
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
await call(alice, "join", [], parseEther("1000"), true);
await call(alice, "join", [], ENTRY);
await call(alice, "join", [], ENTRY, true);
await call(j1, "join", [], ENTRY, true);
await call(bob, "join", [], ENTRY);
await call(alice, "claim", [], 0n, true);
await call(owner, "checkIn", [[alice, bob]], 0n, true);
time = 1500;
await call(eve, "join", [], ENTRY, true);
await call(owner, "checkIn", [[alice, bob]]);
await call(alice, "claim");
assert.equal(await read("deposits", [alice]), 0n);
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
await call(alice, "join", [], ENTRY);
time = 1500;
await call(owner, "checkIn", [[alice]]);
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
await call(alice, "join", [], ENTRY);
time = 2010;
await call(j1, "openCase", [alice, hash]);
time = 3000;
// Check-in never ran: the deposit is refunded with the stake at the deadline.
await call(eve, "forfeit", [alice], 0n, true);
await call(alice, "claim");
await call(j1, "voteSlash", [alice], 0n, true);
await call(eve, "recoverPrize");
await call(owner, "claim");
assert.equal((await vm.stateManager.getAccount(contract)).balance, 0n);
console.log("PASS unresolved case timeout refunds and prize recovery");
await setup();
await call(alice, "join", [], ENTRY);
await call(owner, "cancel");
await call(alice, "claim");
await call(owner, "claim");
await call(bob, "join", [], ENTRY, true);
assert.equal((await vm.stateManager.getAccount(contract)).balance, 0n);
console.log("PASS cancellation refunds");
await setup(2n);
await call(alice, "join", [], ENTRY);
await call(bob, "join", [], ENTRY);
await call(carol, "join", [], ENTRY);
await call(dave, "join", [], ENTRY);
await call(frank, "join", [], ENTRY);
assert.equal(await read("seats"), 2n);
assert.equal(await read("waitlisted", [carol]), true);
assert.equal(await read("joined", [carol]), false);
await call(carol, "withdrawRegistration");
assert.equal(await balance(carol), parseEther("50000"));
await call(carol, "withdrawRegistration", [], 0n, true);
await call(bob, "withdrawRegistration");
assert.equal(await read("joined", [dave]), true, "next in line gets the seat");
assert.equal(await read("waitlisted", [frank]), true);
assert.equal(await read("seats"), 2n);
time = 1500;
await call(eve, "withdrawRegistration", [], 0n, true);
await call(alice, "withdrawRegistration", [], 0n, true);
await call(alice, "checkIn", [[alice]], 0n, true);
await call(owner, "checkIn", [[frank]], 0n, true);
await call(owner, "checkIn", [[alice]]);
await call(owner, "checkIn", [[alice]], 0n, true);
await call(frank, "claim");
assert.equal(
  await balance(frank),
  parseEther("50000"),
  "unseated waitlist refunded",
);
await call(eve, "forfeit", [dave], 0n, true);
time = 2010;
await call(owner, "checkIn", [[dave]], 0n, true);
await call(eve, "forfeit", [alice], 0n, true);
await call(eve, "forfeit", [dave]);
await call(eve, "forfeit", [dave], 0n, true);
assert.equal(await read("rewards", [treasury]), parseEther("100"));
time = 2220;
await call(owner, "finalize", [[dave], [parseEther("10000")]], 0n, true);
await call(owner, "finalize", [[alice], [parseEther("10000")]]);
await call(alice, "claim");
await call(dave, "claim");
await call(treasury, "claim");
assert.equal(await balance(alice), parseEther("60000"));
assert.equal(
  await balance(dave),
  parseEther("49900"),
  "no-show loses deposit only",
);
assert.equal((await vm.stateManager.getAccount(contract)).balance, 0n);
console.log(
  "PASS capacity, waitlist promotion, withdrawal, check-in refund, no-show forfeit, attendee-only prizes",
);
console.log(`${checks} EVM calls/assertions completed.`);
