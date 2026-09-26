import { useState, type FormEvent } from "react";
import { isAddress, type Abi, type Hex } from "viem";
import { withMera, publicClient, walletClientFor } from "../lib/mera";
export function DeployEvent({
  address,
  demo,
}: {
  address: string;
  demo: boolean;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function deploy(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      if (demo)
        throw new Error(
          "Demo mode sends no chain transactions. Finish live testnet config first.",
        );
      const jurors = String(data.get("jurors"))
        .split(",")
        .map((s) => s.trim());
      const treasury = String(data.get("treasury"));
      const start = BigInt(
        Math.floor(new Date(String(data.get("start"))).getTime() / 1000),
      );
      const end = BigInt(
        Math.floor(new Date(String(data.get("end"))).getTime() / 1000),
      );
      const capacity = BigInt(String(data.get("capacity")));
      if (capacity <= 0n) throw new Error("Capacity must be at least 1.");
      const appeal = 86400n;
      const deadline = end + 5n * appeal;
      if (
        jurors.length < 3 ||
        !jurors.every((a) => isAddress(a)) ||
        new Set(jurors.map((s) => s.toLowerCase())).size !== jurors.length ||
        !isAddress(treasury)
      )
        throw new Error(
          "At least three distinct juror addresses and a valid treasury address are required.",
        );
      if (start <= BigInt(Math.floor(Date.now() / 1000)) || end <= start)
        throw new Error("Start must be in the future and end after start.");
      const r = await fetch("/api/contract-artifact");
      if (!r.ok) throw new Error("Compile the contract first.");
      const artifact = (await r.json()) as {
        abi: Abi;
        bytecode: Hex;
        rulesHash: Hex;
      };
      await withMera(false, async (account) => {
        if (account.address.toLowerCase() !== address.toLowerCase())
          throw new Error("Select the passkey you signed in with.");
        if ((await publicClient.getChainId()) !== 10143)
          throw new Error("Monad testnet connection required.");
        const wallet = walletClientFor(account);
        const hash = await wallet.deployContract({
          abi: artifact.abi,
          bytecode: artifact.bytecode,
          args: [
            jurors,
            treasury,
            start,
            end,
            deadline,
            appeal,
            artifact.rulesHash,
            capacity,
          ],
        });
        setMessage("Deployment sent:  " + hash);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw new Error("Deployment failed:  " + hash);
        setMessage(
          "Contract created:  " +
            receipt.contractAddress +
            ". Add this address to the server's ESCROW_ADDRESS and restart the server. This Mera account is the organizer.",
        );
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Deployment failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel padded chain-console">
      <h3>Create event contract</h3>
      <p>
        This Mera account becomes the organizer. Deployment needs gas; prize
        funding comes later.
      </p>
      <form onSubmit={deploy}>
        <label>
          Juror addresses (comma-separated)
          <textarea name="jurors" placeholder="0x…, 0x…, 0x…" required />
        </label>
        <label>
          Treasury for slashed funds
          <input name="treasury" required />
        </label>
        <div className="form-grid">
          <label>
            Start <input name="start" type="datetime-local" required />
          </label>
          <label>
            End <input name="end" type="datetime-local" required />
          </label>
        </div>
        <label>
          Seats (later registrations join the waitlist)
          <input
            name="capacity"
            type="number"
            min={1}
            step={1}
            defaultValue={50}
            required
          />
        </label>
        <p>
          Appeal: 24 hours. Voting window: next 24 hours. Final refund: 5 days
          after end.
        </p>
        <label className="checkbox-label">
          <input type="checkbox" required />
          <span>
            I confirm creating a contract on Monad testnet with a 10,000 MON
            prize, 1,000 MON stake, 100 MON attendance deposit, the seat limit
            and the dates above.
          </span>
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "Deploying…" : "Create contract with Mera"}
        </button>
      </form>
      {message && (
        <p className="transaction-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
