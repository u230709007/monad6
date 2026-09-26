import { useState } from "react";
import {
  isAddress,
  keccak256,
  toBytes,
  parseEther,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { withMera, publicClient, walletClientFor } from "../lib/mera";
const chainAbi = parseAbi([
  "function fundPrize() payable",
  "function checkIn(address[] people)",
  "function forfeit(address participant)",
  "function openCase(address participant,bytes32 evidence)",
  "function appeal(bytes32 evidence)",
  "function voteSlash(address participant)",
  "function resolve(address participant)",
  "function finalize(address[] winners,uint256[] amounts)",
  "function cancel()",
  "function recoverPrize()",
]);
type Action =
  | "fundPrize"
  | "checkIn"
  | "forfeit"
  | "openCase"
  | "appeal"
  | "voteSlash"
  | "resolve"
  | "finalize"
  | "cancel"
  | "recoverPrize";
export function ChainConsole({
  address,
  contract,
  demo,
}: {
  address: string;
  contract: Address | null;
  demo: boolean;
}) {
  const [action, setAction] = useState<Action>("appeal"),
    [participant, setParticipant] = useState(""),
    [evidence, setEvidence] = useState(""),
    [awards, setAwards] = useState(""),
    [attendees, setAttendees] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [approved, setApproved] = useState(false);
  const labels: Record<Action, string> = {
    fundPrize: "Fund prize pool with 10,000 MON",
    checkIn: "Check in attendees (organizer, during event)",
    forfeit: "Forfeit a no-show's 100 MON deposit",
    openCase: "Open a case with evidence (jury)",
    appeal: "Appeal on-chain",
    voteSlash: "Vote to slash 1,000 MON (jury)",
    resolve: "Apply case result",
    finalize: "Allocate prizes (organizer)",
    cancel: "Cancel event (organizer)",
    recoverPrize: "Recover expired prize pool",
  };
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      if (demo)
        throw new Error(
          "Demo mode sends no chain transactions. Live testnet config required.",
        );
      if (!contract) throw new Error("Contract address not configured.");
      if (!approved) throw new Error("Confirm the action summary.");
      const hash = await withMera(false, async (account) => {
        if (account.address.toLowerCase() !== address.toLowerCase())
          throw new Error("Select the passkey you signed in with.");
        if ((await publicClient.getChainId()) !== 10143)
          throw new Error("Only Monad testnet is supported.");
        const client = walletClientFor(account);
        const base = { account, address: contract, abi: chainAbi };
        const target = participant.trim();
        if (
          ["openCase", "voteSlash", "resolve", "forfeit"].includes(action) &&
          !isAddress(target)
        )
          throw new Error("Enter a valid participant address.");
        if (
          ["openCase", "appeal"].includes(action) &&
          evidence.trim().length < 20
        )
          throw new Error("Evidence must be at least 20 characters.");
        const proof = keccak256(toBytes(evidence));
        let hash: Hex;
        if (action === "fundPrize")
          hash = await client.writeContract(
            (
              await publicClient.simulateContract({
                ...base,
                functionName: "fundPrize",
                value: parseEther("10000"),
              })
            ).request,
          );
        else if (action === "openCase")
          hash = await client.writeContract(
            (
              await publicClient.simulateContract({
                ...base,
                functionName: "openCase",
                args: [target as Address, proof],
              })
            ).request,
          );
        else if (action === "appeal")
          hash = await client.writeContract(
            (
              await publicClient.simulateContract({
                ...base,
                functionName: "appeal",
                args: [proof],
              })
            ).request,
          );
        else if (action === "checkIn") {
          const people = attendees
            .split(/[\s,]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (!people.length || !people.every((a) => isAddress(a)))
            throw new Error("Enter one or more valid attendee addresses.");
          if (
            new Set(people.map((a) => a.toLowerCase())).size !== people.length
          )
            throw new Error("List each address only once.");
          hash = await client.writeContract(
            (
              await publicClient.simulateContract({
                ...base,
                functionName: "checkIn",
                args: [people as Address[]],
              })
            ).request,
          );
        } else if (
          action === "voteSlash" ||
          action === "resolve" ||
          action === "forfeit"
        )
          hash = await client.writeContract(
            (
              await publicClient.simulateContract({
                ...base,
                functionName: action,
                args: [target as Address],
              })
            ).request,
          );
        else if (action === "finalize") {
          const rows = awards
            .trim()
            .split("\n")
            .map((line) => line.trim().split(/\s+/));
          if (
            !rows.length ||
            rows.some(
              (r) =>
                r.length !== 2 ||
                !isAddress(r[0]) ||
                !/^\d+(\.\d{1,18})?$/.test(r[1]),
            )
          )
            throw new Error("Each line: 0xaddress MON_amount");
          if (new Set(rows.map((r) => r[0].toLowerCase())).size !== rows.length)
            throw new Error("List each address only once.");
          const amounts = rows.map((r) => parseEther(r[1]));
          if (amounts.reduce((a, b) => a + b, 0n) !== parseEther("10000"))
            throw new Error("Prizes must total 10,000 MON.");
          hash = await client.writeContract(
            (
              await publicClient.simulateContract({
                ...base,
                functionName: "finalize",
                args: [rows.map((r) => r[0] as Address), amounts],
              })
            ).request,
          );
        } else
          hash = await client.writeContract(
            (
              await publicClient.simulateContract({
                ...base,
                functionName: action,
              })
            ).request,
          );
        setMessage("Transaction sent:  " + hash);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw new Error("Transaction failed on-chain:  " + hash);
        return hash;
      });
      setMessage("Transaction confirmed:  " + hash);
      setApproved(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel padded chain-console">
      <div className="eyebrow">MONAD TESTNET</div>
      <h3>Contract actions</h3>
      <p>
        Permissions and deadlines are enforced by the contract. AI reports
        cannot trigger these actions.
      </p>
      <label>
        Action{" "}
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value as Action);
            setApproved(false);
          }}
        >
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {["openCase", "voteSlash", "resolve", "forfeit"].includes(action) && (
        <label>
          Participant address
          <input
            value={participant}
            onChange={(e) => {
              setParticipant(e.target.value);
              setApproved(false);
            }}
            placeholder="0x…"
          />
        </label>
      )}
      {action === "checkIn" && (
        <label>
          Attendee addresses
          <textarea
            value={attendees}
            onChange={(e) => {
              setAttendees(e.target.value);
              setApproved(false);
            }}
            placeholder="0x…&#10;0x…"
          />
          <small>
            Only seat holders present at the venue. Checked-in participants can
            claim their deposit right away; everyone else forfeits it after the
            event and cannot win prizes.
          </small>
        </label>
      )}
      {["openCase", "appeal"].includes(action) && (
        <label>
          Evidence description / link
          <textarea
            value={evidence}
            onChange={(e) => {
              setEvidence(e.target.value);
              setApproved(false);
            }}
          />
          <small>
            The keccak256 hash of the text is written on-chain. Submit the file
            itself to the jury separately.
          </small>
        </label>
      )}
      {action === "finalize" && (
        <label>
          Prize distribution
          <textarea
            value={awards}
            onChange={(e) => {
              setAwards(e.target.value);
              setApproved(false);
            }}
            placeholder="0xparticipant_address 6000&#10;0xparticipant_address 4000"
          />
          <small>
            One participant address and MON amount per line. Total 10,000 MON.
          </small>
        </label>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={approved}
          onChange={(e) => setApproved(e.target.checked)}
        />
        <span>
          I confirm: {labels[action]}, with the details above, on testnet.
        </span>
      </label>
      <button
        className="button primary"
        disabled={busy || !approved}
        onClick={submit}
      >
        {busy ? "Working…" : "Sign with Mera passkey"}
      </button>
      {message && (
        <p role="status" className="transaction-message">
          {message}
        </p>
      )}
    </section>
  );
}
