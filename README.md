# BuildProof

<!-- DEMO VIDEO: paste your link or embed here (YouTube, Loom, or an uploaded .mp4) -->

&nbsp;

**Proof of process for hackathons in the age of AI.**

Judges usually see only the final demo. BuildProof records how a project was actually built: which baseline it started from, what the team asked an AI assistant, and what got committed. Organizers get a tamper-evident log and neutral review signals instead of guesswork. Runs on **Monad testnet**.

## What it does

| Role            | What they get                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Participant** | Passkey account (no seed phrase), a project profile, an AI build assistant that can read the repo and commit approved changes to GitHub, and a way to file an appeal. |
| **Juror**       | Every participant's prompt log, a check that the log has not been altered, GitHub timeline signals, an AI-written review report, and a one-click evidence export.     |
| **Organizer**   | An escrow contract that locks the prize pool and participant collateral, and lets jurors vote to slash collateral for confirmed violations.                           |

## How it works

1. **Sign in with a passkey.** [Mera](https://www.npmjs.com/package/@category-labs/mera) creates a passkey-backed wallet. The key is never sent to the server or stored in the browser. Each on-chain or payment action asks for the passkey again.
2. **Declare the project.** Team, project, GitHub repo and the baseline commit SHA the work starts from. The server asks GitHub whether that commit really exists and stores its date.
3. **Join.** The participant locks 1,000 MON of collateral plus a 100 MON attendance deposit. Seats are limited; once they are full, new registrations join an on-chain waitlist.
4. **Build with the assistant.** Each request is paid per call over [x402](https://www.x402.org/), answered by the configured AI model, and appended to a SHA-256 hash chain. The assistant sees the repo and can propose full-file changes; the participant approves them and they are committed to GitHub with a traceable message.
5. **Review.** Jurors check log integrity, read timeline signals, generate an AI report and export evidence.
6. **Settle.** After the appeal window, a juror majority decides on collateral slashing. Winners and refunds are withdrawn with `claim`.

## Evidence and integrity

- **Hash chain.** Every log entry stores the hash of the previous one. `GET /api/chain/verify` (participant) and `GET /api/jury/:id/verify` (juror) recompute the chain and report the first broken link. Publish the head hash somewhere public (repo README, a post) to make later rewrites detectable.
- **Log anchoring.** `POST /api/chain/anchor` commits the current head hash to `.buildproof/chain-head.json` in the participant's repo (needs `GITHUB_TOKEN`). The GitHub commit date is then a timestamp the server operator cannot rewrite. Anchors are listed in the evidence export. Anchor regularly; only the log up to each anchor is covered.
- **Baseline check.** The declared baseline SHA is verified against GitHub and the commit date is stored. After joining, the baseline cannot be changed.
- **Timeline signals.** `GET /api/jury/:id/signals` compares commit dates with the declared baseline, the event start (`EVENT_START_ISO`) and the first logged prompt. The output is neutral observations for the jury to question, never a verdict.
- **Evidence export.** `GET /api/jury/:id/export` returns one JSON bundle: profile, integrity result, full log, applied commits, appeals and the AI report.

### Limits

Be clear about what this does not prove:

- The chain is checked **inside this database only**. A server operator could rewrite the whole history. Only entries covered by a GitHub anchor (see above) have an outside timestamp, and the participant controls that repo.
- Prompt logs do not prove when a project started, and work done outside the assistant is invisible.
- The AI report only summarizes existing records. It cannot confirm cheating and never applies penalties.
- Baseline verification needs a public repo (or a `GITHUB_TOKEN` with access).

## Escrow contract

[`contracts/HackathonEscrow.sol`](contracts/HackathonEscrow.sol) covers a single event:

- The organizer funds a 10,000 MON prize pool before registration opens. Registration closes at event start.
- Participants lock 1,000 MON each. Organizer and jurors cannot participate.
- **Attendance deposit and waitlist.** Each registration also locks 100 MON, and seats are capped at the `capacity` set at deploy time. Extra registrations are queued on-chain. Before the start anyone can `withdrawRegistration` for a full refund, and the freed seat goes to the next person in line. The organizer calls `checkIn` during the event; checked-in participants can claim the deposit at once. After the end, `forfeit` sends a no-show's deposit to the treasury, and only checked-in participants can win prizes. People who hold a seat but never come lose money, so they have a reason to free the seat early for the waitlist. Unseated waitlisters get everything back at the start. If check-in never happens, deposits are refunded at the deadline.
- After the event a juror can open a case with an evidence digest. The participant answers in the first appeal window.
- Votes happen after that window. When the second window ends, a majority slashes the collateral; otherwise it is kept.
- Prizes are final only when every case is resolved. Slashed collateral goes to a treasury address fixed at deploy time.
- Payouts are pulled with `claim`; double claims and reentrancy are blocked.
- Cancel before start refunds everyone. If an event never finalizes, participants recover their collateral and the organizer recovers the remaining pool after the deadline.

## Quick start

Requires **Node.js 24+** (built-in SQLite).

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open http://localhost:5173. Keep the hostname fixed: `localhost` and `127.0.0.1` are different passkey relying parties. The API runs on `localhost:3001`.

The default **demo mode** makes no external AI calls and moves no funds. The full flow works: demo account, project, join, AI workspace, juror report. Replies and reports are labeled as demo. In demo mode every demo session is visible to the juror view, so do not enter real sensitive data.

### Configuration

| Variable                                               | Purpose                                                                                                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_MODE`                                             | `demo` (default) or `live`. Each mode uses its own SQLite file.                                                                                                                        |
| `AI_PROVIDER`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `AGENT_PRIVATE_KEY`, `SILORAIL_*` | LLM provider: `gemini` (server-side Google AI Studio key, default when set), `openrouter` (server key funded by MOST credit, any model), `silorail` (keyless, agent wallet pays USDC per call over x402) or `mock`. Participants never handle a key. |
| `ALLOW_DEMO_LOGIN`, `DEMO_PROMPT_LIMIT` | Show the "Try demo" login in live mode too (always on in demo mode). Demo accounts skip the chain and x402, get real AI replies up to the prompt cap, cannot read or commit to GitHub repos and are hidden from the jury list. |
| —                                                      | Open-source track: participants apply at [most.devnads.com](https://most.devnads.com) (Monad Open Source Track) from the Project page; credits are discretionary and granted by Monad. |
| `GITHUB_TOKEN`                                         | Fine-grained token with Contents read/write on the participant repo. Enables repo context, commits and baseline checks on private repos.                                               |
| `ESCROW_ADDRESS`, `JURY_ADDRESSES`, `TREASURY_ADDRESS` | Deployed contract and at least three juror addresses.                                                                                                                                  |
| `X402_*`                                               | Facilitator URL, network, EIP-3009 token, pay-to address, price.                                                                                                                       |
| `EVENT_START_ISO`                                      | Enables the "commits before event start" signal.                                                                                                                                       |
| `EVENT_CAPACITY`                                       | Seat limit for `contracts:deploy` (default 50). The organizer panel asks for it directly.                                                                                              |

Never prefix secrets with `VITE_`. Do not overwrite an existing `.env` with the example file.

### Going live on Monad testnet

1. Set `APP_MODE=live` and fill in the AI, `APP_ORIGIN` and x402 values. The server refuses to start if a live setting is missing.
2. Create the organizer account with Mera and fund it with testnet gas.
3. `npm run contracts:compile`, then deploy from the **Funds & rewards** screen with the organizer passkey. Put the resulting address in `ESCROW_ADDRESS` and restart.
4. Fund the prize pool from the same screen. Fund participant wallets with testnet MON (1,000 MON collateral + 100 MON deposit plus gas each). Faucet limits may not cover this.
5. Set `JURY_ADDRESSES` to three or more distinct juror accounts.

x402 payments and MON collateral are separate. x402 uses an EIP-3009 ERC-20 token, not native MON, and your facilitator must support the chosen network and token. No working facilitator or token address is bundled.

## Scripts

| Command                                        | Description                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                  | API and web app with hot reload                                                                               |
| `npm run build` / `npm start`                  | Production build / serve                                                                                      |
| `npm test`                                     | Unit tests (log integrity and anchoring, timeline signals, GitHub/SiloRail/open-source helpers, Mera helpers) |
| `npm run typecheck`                            | Client and server type checks                                                                                 |
| `npm run contracts:compile` / `contracts:test` | Compile and test the escrow contract                                                                          |
| `npm run test:api`                             | API smoke test                                                                                                |

## Tech stack

React 19, TypeScript, Vite · Express 5, Node SQLite · viem · Mera passkey accounts · x402 · Solidity on Monad testnet.

## Status and roadmap

Testnet only, one event per deployment, one AI provider. Not yet built: multiple events per server, team invites and membership, sponsor budget top-ups, on-chain anchoring of the chain head (GitHub anchoring exists), and a professional contract audit (required before any mainnet use).

## Acknowledgements

The LLM-based evaluation model in this project was inspired by Monad's MOST program and by the SiloRail project by @brutal_devvin.

More detail lives in [docs/](docs/) (`PRODUCT.md`, `RULES.md`, `VERIFICATION.md`; currently in Turkish).
