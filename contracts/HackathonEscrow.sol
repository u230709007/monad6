// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Per-event MON escrow. AI has no authority over funds.
contract HackathonEscrow {
    uint256 public constant STAKE = 1000 ether;
    /// @dev Attendance deposit: refunded on check-in, forfeited to the treasury by no-shows.
    uint256 public constant DEPOSIT = 100 ether;
    address public immutable organizer;
    address public immutable treasury;
    uint256 public immutable start;
    uint256 public immutable end;
    uint256 public immutable deadline;
    uint256 public immutable appealPeriod;
    bytes32 public immutable rulesHash;
    uint256 public immutable threshold;
    uint256 public immutable capacity;
    uint256 public seats;
    uint256 public checkIns;
    uint256 public prizePool;
    uint256 public openCases;
    bool public funded;
    bool public finalized;
    bool public cancelled;
    mapping(address => bool) public jury;
    mapping(address => bool) public joined;
    mapping(address => uint256) public stakes;
    mapping(address => uint256) public rewards;
    mapping(address => uint256) public deposits;
    mapping(address => bool) public checkedIn;
    mapping(address => bool) public waitlisted;
    /// @dev 1-based slot in `waitlist`; stale queue entries (left, rejoined) are skipped on promotion.
    mapping(address => uint256) public queuePosition;
    address[] public waitlist;
    uint256 public waitlistHead;
    struct Case { bytes32 evidence; uint256 opened; uint256 votes; bool appealed; bool resolved; bool slash; }
    mapping(address => Case) public cases;
    mapping(address => mapping(address => bool)) public voted;
    uint256 private entered;
    event Joined(address indexed participant);
    event Waitlisted(address indexed participant, uint256 position);
    event Left(address indexed participant);
    event CheckedIn(address indexed participant);
    event Forfeited(address indexed participant, uint256 amount);
    event CaseOpened(address indexed participant, bytes32 evidence);
    event Appealed(address indexed participant, bytes32 evidence);
    event Voted(address indexed participant, address indexed juror);
    event Resolved(address indexed participant, bool slashed);
    event Finalized();
    event Cancelled();
    event Claimed(address indexed account, uint256 amount);
    modifier guard() { require(entered == 0, "Reentrancy"); entered = 1; _; entered = 0; }
    modifier onlyJury() { require(jury[msg.sender], "Jury only"); _; }
    constructor(address[] memory jurors, address fund, uint256 begins, uint256 ends, uint256 expires, uint256 appealSeconds, bytes32 rules, uint256 seatLimit) {
        require(jurors.length >= 3 && fund != address(0), "Invalid jury/fund");
        require(begins > block.timestamp && ends > begins && appealSeconds > 0 && expires > ends + appealSeconds * 2, "Invalid dates");
        require(rules != bytes32(0), "Rules required");
        require(seatLimit > 0, "Capacity required");
        for (uint256 i; i < jurors.length; i++) { require(jurors[i] != address(0) && !jury[jurors[i]], "Duplicate jury"); jury[jurors[i]] = true; }
        organizer = msg.sender; treasury = fund; start = begins; end = ends; deadline = expires; appealPeriod = appealSeconds; rulesHash = rules; threshold = jurors.length / 2 + 1; capacity = seatLimit;
    }
    function fundPrize() external payable { require(msg.sender == organizer && !funded && block.timestamp < start && !cancelled, "Funding closed"); require(msg.value == 10000 ether, "10000 MON required"); funded = true; prizePool = msg.value; }
    /// @notice Locks stake + attendance deposit. When all seats are taken the caller joins the waitlist.
    function join() external payable {
        require(funded && !cancelled && block.timestamp < start && !joined[msg.sender] && !waitlisted[msg.sender] && !jury[msg.sender] && msg.sender != organizer, "Registration closed");
        require(msg.value == STAKE + DEPOSIT, "1100 MON required");
        stakes[msg.sender] = STAKE; deposits[msg.sender] = DEPOSIT;
        if (seats < capacity) { joined[msg.sender] = true; seats++; emit Joined(msg.sender); }
        else { waitlisted[msg.sender] = true; waitlist.push(msg.sender); queuePosition[msg.sender] = waitlist.length; emit Waitlisted(msg.sender, waitlist.length); }
    }
    /// @notice Before the start, a seat holder or waitlisted person can withdraw everything. A freed seat goes to the next in line.
    function withdrawRegistration() external guard {
        require(!cancelled && block.timestamp < start && (joined[msg.sender] || waitlisted[msg.sender]), "Cannot withdraw");
        if (joined[msg.sender]) { joined[msg.sender] = false; seats--; } else { waitlisted[msg.sender] = false; queuePosition[msg.sender] = 0; }
        uint256 amount = stakes[msg.sender] + deposits[msg.sender]; stakes[msg.sender] = 0; deposits[msg.sender] = 0;
        while (seats < capacity && waitlistHead < waitlist.length) {
            address next = waitlist[waitlistHead++];
            if (waitlisted[next] && queuePosition[next] == waitlistHead) { waitlisted[next] = false; queuePosition[next] = 0; joined[next] = true; seats++; emit Joined(next); }
        }
        emit Left(msg.sender);
        (bool ok,) = payable(msg.sender).call{value: amount}(""); require(ok, "Transfer failed");
    }
    /// @notice Organizer records attendance during the event. Checked-in participants can claim their deposit at once.
    function checkIn(address[] calldata people) external {
        require(msg.sender == organizer && !cancelled && block.timestamp >= start && block.timestamp < end, "Check-in closed");
        for (uint256 i; i < people.length; i++) { require(joined[people[i]] && !checkedIn[people[i]], "Invalid check-in"); checkedIn[people[i]] = true; emit CheckedIn(people[i]); }
        checkIns += people.length;
    }
    /// @notice After the event anyone can move a no-show's deposit to the treasury. Skipped if check-in never ran.
    function forfeit(address participant) external {
        require(!cancelled && block.timestamp >= end && checkIns > 0 && joined[participant] && !checkedIn[participant] && deposits[participant] > 0, "Cannot forfeit");
        uint256 value = deposits[participant]; deposits[participant] = 0; rewards[treasury] += value; emit Forfeited(participant, value);
    }
    function openCase(address participant, bytes32 evidence) external onlyJury {
        require(!cancelled && !finalized && block.timestamp >= end && block.timestamp + appealPeriod * 2 < deadline, "Review closed");
        require(joined[participant] && cases[participant].opened == 0 && evidence != bytes32(0), "Invalid case");
        cases[participant] = Case(evidence, block.timestamp, 0, false, false, false); openCases++; emit CaseOpened(participant, evidence);
    }
    function appeal(bytes32 evidence) external {
        Case storage c = cases[msg.sender]; require(!cancelled && c.opened > 0 && !c.resolved && !c.appealed && block.timestamp < c.opened + appealPeriod && evidence != bytes32(0), "Appeal closed");
        c.appealed = true; emit Appealed(msg.sender, evidence);
    }
    function voteSlash(address participant) external onlyJury {
        Case storage c = cases[participant]; require(!cancelled && !finalized && c.opened > 0 && !c.resolved && block.timestamp >= c.opened + appealPeriod && block.timestamp < deadline && !voted[participant][msg.sender], "Vote closed");
        voted[participant][msg.sender] = true; c.votes++; emit Voted(participant, msg.sender);
    }
    function resolve(address participant) external {
        Case storage c = cases[participant]; require(!cancelled && !finalized && c.opened > 0 && !c.resolved && block.timestamp >= c.opened + appealPeriod * 2 && block.timestamp < deadline, "Resolution closed");
        c.resolved = true; openCases--; c.slash = c.votes >= threshold;
        if (c.slash) { uint256 value = stakes[participant]; stakes[participant] = 0; rewards[treasury] += value; }
        emit Resolved(participant, c.slash);
    }
    /// @dev Organizer distributes only the prefunded pool; unresolved cases cannot receive awards.
    function finalize(address[] calldata winners, uint256[] calldata amounts) external {
        require(msg.sender == organizer && funded && !cancelled && !finalized && openCases == 0 && block.timestamp >= end + appealPeriod * 2 && block.timestamp < deadline, "Finalization closed");
        require(winners.length > 0 && winners.length == amounts.length, "Invalid awards");
        uint256 total;
        for (uint256 i; i < winners.length; i++) { Case storage c = cases[winners[i]]; require(joined[winners[i]] && checkedIn[winners[i]] && !c.slash && (c.opened == 0 || c.resolved) && amounts[i] > 0, "Ineligible winner"); total += amounts[i]; rewards[winners[i]] += amounts[i]; }
        require(total == prizePool, "Allocate full pool"); prizePool = 0; finalized = true; emit Finalized();
    }
    function cancel() external { require(msg.sender == organizer && block.timestamp < start && !cancelled, "Cannot cancel"); cancelled = true; rewards[organizer] += prizePool; prizePool = 0; emit Cancelled(); }
    function recoverPrize() external { require(block.timestamp >= deadline && !finalized && prizePool > 0, "Not expired"); rewards[organizer] += prizePool; prizePool = 0; }
    function claim() external guard {
        uint256 amount = rewards[msg.sender]; rewards[msg.sender] = 0;
        Case storage c = cases[msg.sender];
        // Waitlisted people who never got a seat are released in full once the event starts.
        bool released = cancelled || (waitlisted[msg.sender] && block.timestamp >= start);
        if (released || block.timestamp >= deadline || (finalized && (c.opened == 0 || c.resolved))) { amount += stakes[msg.sender]; stakes[msg.sender] = 0; }
        if (released || checkedIn[msg.sender] || (checkIns == 0 && block.timestamp >= deadline)) { amount += deposits[msg.sender]; deposits[msg.sender] = 0; }
        require(amount > 0, "Nothing claimable"); (bool ok,) = payable(msg.sender).call{value: amount}(""); require(ok, "Transfer failed"); emit Claimed(msg.sender, amount);
    }
}
