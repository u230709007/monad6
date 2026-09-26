// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Per-event MON escrow. AI has no authority over funds.
contract HackathonEscrow {
    uint256 public constant STAKE = 1000 ether;
    address public immutable organizer;
    address public immutable treasury;
    uint256 public immutable start;
    uint256 public immutable end;
    uint256 public immutable deadline;
    uint256 public immutable appealPeriod;
    bytes32 public immutable rulesHash;
    uint256 public immutable threshold;
    uint256 public prizePool;
    uint256 public openCases;
    bool public funded;
    bool public finalized;
    bool public cancelled;
    mapping(address => bool) public jury;
    mapping(address => bool) public joined;
    mapping(address => uint256) public stakes;
    mapping(address => uint256) public rewards;
    struct Case { bytes32 evidence; uint256 opened; uint256 votes; bool appealed; bool resolved; bool slash; }
    mapping(address => Case) public cases;
    mapping(address => mapping(address => bool)) public voted;
    uint256 private entered;
    event Joined(address indexed participant);
    event CaseOpened(address indexed participant, bytes32 evidence);
    event Appealed(address indexed participant, bytes32 evidence);
    event Voted(address indexed participant, address indexed juror);
    event Resolved(address indexed participant, bool slashed);
    event Finalized();
    event Cancelled();
    event Claimed(address indexed account, uint256 amount);
    modifier guard() { require(entered == 0, "Reentrancy"); entered = 1; _; entered = 0; }
    modifier onlyJury() { require(jury[msg.sender], "Jury only"); _; }
    constructor(address[] memory jurors, address fund, uint256 begins, uint256 ends, uint256 expires, uint256 appealSeconds, bytes32 rules) {
        require(jurors.length >= 3 && fund != address(0), "Invalid jury/fund");
        require(begins > block.timestamp && ends > begins && appealSeconds > 0 && expires > ends + appealSeconds * 2, "Invalid dates");
        require(rules != bytes32(0), "Rules required");
        for (uint256 i; i < jurors.length; i++) { require(jurors[i] != address(0) && !jury[jurors[i]], "Duplicate jury"); jury[jurors[i]] = true; }
        organizer = msg.sender; treasury = fund; start = begins; end = ends; deadline = expires; appealPeriod = appealSeconds; rulesHash = rules; threshold = jurors.length / 2 + 1;
    }
    function fundPrize() external payable { require(msg.sender == organizer && !funded && block.timestamp < start && !cancelled, "Funding closed"); require(msg.value == 10000 ether, "10000 MON required"); funded = true; prizePool = msg.value; }
    function join() external payable { require(funded && !cancelled && block.timestamp < start && !joined[msg.sender] && !jury[msg.sender] && msg.sender != organizer, "Registration closed"); require(msg.value == STAKE, "1000 MON required"); joined[msg.sender] = true; stakes[msg.sender] = msg.value; emit Joined(msg.sender); }
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
        for (uint256 i; i < winners.length; i++) { Case storage c = cases[winners[i]]; require(joined[winners[i]] && !c.slash && (c.opened == 0 || c.resolved) && amounts[i] > 0, "Ineligible winner"); total += amounts[i]; rewards[winners[i]] += amounts[i]; }
        require(total == prizePool, "Allocate full pool"); prizePool = 0; finalized = true; emit Finalized();
    }
    function cancel() external { require(msg.sender == organizer && block.timestamp < start && !cancelled, "Cannot cancel"); cancelled = true; rewards[organizer] += prizePool; prizePool = 0; emit Cancelled(); }
    function recoverPrize() external { require(block.timestamp >= deadline && !finalized && prizePool > 0, "Not expired"); rewards[organizer] += prizePool; prizePool = 0; }
    function claim() external guard {
        uint256 amount = rewards[msg.sender]; rewards[msg.sender] = 0;
        Case storage c = cases[msg.sender];
        if (cancelled || block.timestamp >= deadline || (finalized && (c.opened == 0 || c.resolved))) { amount += stakes[msg.sender]; stakes[msg.sender] = 0; }
        require(amount > 0, "Nothing claimable"); (bool ok,) = payable(msg.sender).call{value: amount}(""); require(ok, "Transfer failed"); emit Claimed(msg.sender, amount);
    }
}
