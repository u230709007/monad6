# BuildProof event rules — v1

The keccak256 hash of this text is pinned when the contract is created.

1. The prize pool is 10,000 MON and the stake is 1,000 MON per person. AI usage fees are not taken from the stake.
2. The organizer funds the pool before the event starts. Participants deposit their stake before the start. The organizer and jurors cannot compete.
3. Start/end, appeal window, final refund date, juror addresses and the slash treasury address are fixed in the contract.
4. Presenting prior work as new, claiming another team's work, or knowingly misleading with evidence is grounds for review. Pre-existing code, open-source dependencies and the baseline repo must be declared.
5. Work outside the router or a small number of prompts is not a violation on its own. An AI report is not a verdict or an accusation. The jury reviews context, the baseline declaration and concrete evidence.
6. After the event, and at least two appeal windows before the final deadline, the jury opens a case with an evidence summary. The participant may submit evidence before the first window ends. In the next window the jury votes. If a simple majority of votes favors slashing, the 1,000 MON stake is slashed; otherwise it is kept.
7. Appeal details are assessed by the jury. The chain enforces jury votes and deadlines; it does not judge the truth of the evidence itself.
8. Slashed stakes go to the predefined treasury. No prize can be allocated to a slashed participant. Prize allocation is not final until all open cases are resolved.
9. The organizer allocates the whole prize pool to eligible participants. Team prizes are split explicitly between member addresses. Prize selection belongs to the organizer; there is no automatic AI scoring.
10. After finalization, eligible participants withdraw their own stake and prize. If cancelled before the start, stakes and the pool can be refunded. At the final deadline, the remaining stake of unresolved cases can be withdrawn; an unallocated prize pool returns to the organizer.
11. Prompts and replies are visible to the authorized jury. Do not submit secret keys, passwords or sensitive personal data. Data retention and access policy must be described separately in the event announcement.
12. This version is a Monad testnet MVP. MON amounts are testnet units. Demo mode makes no chain payments or real AI calls.
