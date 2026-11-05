// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import {IEntropyV2} from "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";
import {GachardCards} from "./GachardCards.sol";
import {SigCheck} from "./lib/SigCheck.sol";
import {WindowLimits} from "./lib/WindowLimits.sol";

/**
 * @title GachardStore
 * @notice Store rotations and purchases (ADR-038), as a replaceable module.
 * @dev docs/CONTRACT-V2-SPEC.md §7. One Pyth Entropy request per rotation for
 *      the whole platform, plus a server secret committed before the rotation
 *      and revealed after it:
 *      - nobody outside the server can compute a store while it is live, so
 *        Detection and the reveal keep their meaning;
 *      - the server cannot pick its secret after seeing the seed;
 *      - after the reveal, anyone can recompute every store and check every purchase.
 *      Deriving a store from (seed, secret, holder) happens off chain, as in
 *      ADR-029 Opsi B, so the algorithm itself is not proven unbiased.
 */
contract GachardStore is IEntropyConsumer, AccessControlEnumerable, Pausable, ReentrancyGuard, EIP712, WindowLimits {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    bytes32 public constant LIMIT_PURCHASE_CARDS = keccak256("LIMIT_PURCHASE_CARDS");

    uint256 public constant MAX_BATCH = 25;
    uint256 public constant MAX_SIGNATURE_TTL = 1 hours;
    /// @notice A reveal later than this after `revealAfter` shows on chain as overdue.
    uint256 public constant REVEAL_GRACE = 24 hours;

    bytes32 public constant PURCHASE_TYPEHASH =
        keccak256("Purchase(bytes32 purchaseId,address buyer,uint256 rotationId,uint32[] templateIds,uint256 deadline)");

    IEntropyV2 public immutable entropy;
    GachardCards public immutable cards;

    /// @notice Co-signs every purchase when set (decision D3: required before mainnet).
    address public attestor;

    struct Rotation {
        bytes32 secretHash; // keccak256(abi.encode(secret)), committed before the seed exists
        bytes32 seed; // from Pyth
        bytes32 secret; // revealed after the rotation
        uint40 endsAt;
        uint40 revealAfter; // endsAt plus the Reserve window (ADR-038: 24 h)
        uint64 sequence;
        bool seedRequested;
        bool revealed;
    }

    mapping(uint256 rotationId => Rotation) private _rotations;
    /// @dev Stored as rotationId + 1, so zero means "not ours".
    mapping(uint64 sequence => uint256) private _rotationOfSequence;
    /// @notice Non-zero once a purchase is recorded; makes retries safe.
    mapping(bytes32 purchaseId => bytes32) public purchaseHashOf;

    event AttestorChanged(address indexed attestor);
    event RotationCommitted(uint256 indexed rotationId, bytes32 secretHash, uint40 endsAt, uint40 revealAfter);
    event RotationEntropyRequested(uint256 indexed rotationId, uint64 sequence);
    event RotationSeeded(uint256 indexed rotationId, bytes32 seed);
    event RotationRevealed(uint256 indexed rotationId, bytes32 secret);
    event Purchased(
        bytes32 indexed purchaseId,
        address indexed buyer,
        uint256 indexed rotationId,
        uint32[] templateIds,
        uint256 firstTokenId
    );
    event Withdrawn(address indexed to, uint256 amount);

    error ZeroAddress();
    error BadBatch(uint256 length);
    error AlreadyCommitted(uint256 rotationId);
    error NotCommitted(uint256 rotationId);
    error BadRotationTimes();
    error EntropyAlreadyRequested(uint256 rotationId);
    error InsufficientFeeBalance(uint256 fee, uint256 balance);
    error StoreNotReady(uint256 rotationId);
    error RotationClosed(uint256 rotationId);
    error TooEarlyToReveal(uint256 rotationId, uint256 revealAfter);
    error AlreadyRevealed(uint256 rotationId);
    error SecretMismatch(uint256 rotationId);
    error PurchaseAlreadyRecorded(bytes32 purchaseId);
    error BadAttestation();
    error SignatureExpired(uint256 deadline);
    error DeadlineTooFar(uint256 deadline);
    error WithdrawFailed();

    constructor(address entropy_, GachardCards cards_, address admin, address guardian, address unpauser)
        EIP712("GachardStore", "1")
    {
        if (
            entropy_ == address(0) || address(cards_) == address(0) || admin == address(0)
                || guardian == address(0) || unpauser == address(0)
        ) revert ZeroAddress();
        entropy = IEntropyV2(entropy_);
        cards = cards_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
        _grantRole(UNPAUSER_ROLE, unpauser);
    }

    // ═══ Rotations ══════════════════════════════════════════════════════════

    /// @notice Step 1: commit the server secret before the seed exists.
    function commitRotation(uint256 rotationId, bytes32 secretHash, uint40 endsAt, uint40 revealAfter)
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
    {
        Rotation storage r = _rotations[rotationId];
        if (r.secretHash != bytes32(0)) revert AlreadyCommitted(rotationId);
        if (secretHash == bytes32(0) || endsAt <= block.timestamp || revealAfter < endsAt) revert BadRotationTimes();
        r.secretHash = secretHash;
        r.endsAt = endsAt;
        r.revealAfter = revealAfter;
        emit RotationCommitted(rotationId, secretHash, endsAt, revealAfter);
    }

    /// @notice Step 2: ask Pyth for this rotation's seed. One request per rotation, not per pack.
    function requestRotationEntropy(uint256 rotationId)
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint64 sequence)
    {
        Rotation storage r = _rotations[rotationId];
        if (r.secretHash == bytes32(0)) revert NotCommitted(rotationId);
        if (r.seedRequested) revert EntropyAlreadyRequested(rotationId);
        uint256 fee = entropy.getFeeV2();
        if (address(this).balance < fee) revert InsufficientFeeBalance(fee, address(this).balance);
        r.seedRequested = true;
        sequence = entropy.requestV2{value: fee}();
        r.sequence = sequence;
        _rotationOfSequence[sequence] = rotationId + 1;
        emit RotationEntropyRequested(rotationId, sequence);
    }

    /// @dev Only Pyth reaches this (IEntropyConsumer checks the caller). Never reverts:
    ///      an unknown sequence is ignored rather than failing Pyth's callback.
    function entropyCallback(uint64 sequence, address, bytes32 randomNumber) internal override {
        uint256 key = _rotationOfSequence[sequence];
        if (key == 0) return;
        Rotation storage r = _rotations[key - 1];
        if (r.seed != bytes32(0)) return;
        r.seed = randomNumber;
        emit RotationSeeded(key - 1, randomNumber);
    }

    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    /// @notice Step 4: publish the secret. Allowed even while paused: transparency never waits.
    function revealRotation(uint256 rotationId, bytes32 secret) external onlyRole(RELAYER_ROLE) {
        Rotation storage r = _rotations[rotationId];
        if (r.secretHash == bytes32(0)) revert NotCommitted(rotationId);
        if (r.revealed) revert AlreadyRevealed(rotationId);
        if (block.timestamp < r.revealAfter) revert TooEarlyToReveal(rotationId, r.revealAfter);
        if (keccak256(abi.encode(secret)) != r.secretHash) revert SecretMismatch(rotationId);
        r.secret = secret;
        r.revealed = true;
        emit RotationRevealed(rotationId, secret);
    }

    /// @notice True once a rotation's secret is more than REVEAL_GRACE late. Monitoring alerts on it.
    function rotationOverdue(uint256 rotationId) external view returns (bool) {
        Rotation storage r = _rotations[rotationId];
        return r.secretHash != bytes32(0) && !r.revealed && block.timestamp > uint256(r.revealAfter) + REVEAL_GRACE;
    }

    function rotation(uint256 rotationId) external view returns (Rotation memory) {
        return _rotations[rotationId];
    }

    // ═══ Purchases ══════════════════════════════════════════════════════════

    /**
     * @notice Step 3: mint what a buyer paid for, from the store of this rotation.
     * @dev Payment happens off chain in Credits (ADR-008). When an attestor is set,
     *      it must co-sign, so a leaked Relayer key alone cannot mint purchases.
     *      `purchaseId` makes a retry revert instead of minting twice (ADR-031's
     *      "could not coalesce" hazard).
     */
    function purchase(
        bytes32 purchaseId,
        address buyer,
        uint256 rotationId,
        uint32[] calldata templateIds,
        uint256 deadline,
        bytes calldata attestation
    ) external onlyRole(RELAYER_ROLE) whenNotPaused nonReentrant returns (uint256 firstTokenId) {
        uint256 n = templateIds.length;
        if (n == 0 || n > MAX_BATCH) revert BadBatch(n);
        if (buyer == address(0)) revert ZeroAddress();
        if (purchaseHashOf[purchaseId] != bytes32(0)) revert PurchaseAlreadyRecorded(purchaseId);

        Rotation storage r = _rotations[rotationId];
        if (r.seed == bytes32(0)) revert StoreNotReady(rotationId);
        if (r.revealed || block.timestamp >= r.revealAfter) revert RotationClosed(rotationId);

        bytes32 templatesHash = keccak256(abi.encodePacked(templateIds));
        if (attestor != address(0)) {
            if (block.timestamp > deadline) revert SignatureExpired(deadline);
            if (deadline > block.timestamp + MAX_SIGNATURE_TTL) revert DeadlineTooFar(deadline);
            bytes32 digest = _hashTypedDataV4(
                keccak256(abi.encode(PURCHASE_TYPEHASH, purchaseId, buyer, rotationId, templatesHash, deadline))
            );
            if (!SigCheck.isValidNow(attestor, digest, attestation)) revert BadAttestation();
        }

        _consume(LIMIT_PURCHASE_CARDS, msg.sender, n);
        purchaseHashOf[purchaseId] = keccak256(abi.encode(rotationId, buyer, templatesHash));
        firstTokenId = cards.mint(buyer, templateIds, GachardCards.Channel.Store);
        emit Purchased(purchaseId, buyer, rotationId, templateIds, firstTokenId);
    }

    // ═══ Admin and safety ═══════════════════════════════════════════════════

    function setAttestor(address newAttestor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        attestor = newAttestor;
        emit AttestorChanged(newAttestor);
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(UNPAUSER_ROLE) {
        _unpause();
    }

    function setLimit(bytes32 action, uint64 max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setLimit(action, max);
    }

    function lowerLimit(bytes32 action, uint64 max) external onlyRole(GUARDIAN_ROLE) {
        _lowerLimit(action, max);
    }

    function emergencyRevokeRelayer(address account) external onlyRole(GUARDIAN_ROLE) {
        _revokeRole(RELAYER_ROLE, account);
    }

    /// @notice v1's PackEntropy had no way out for its MON (ADR-036). This one does, slowly.
    function withdraw(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(to, amount);
    }

    /// @notice Funds Pyth Entropy fees.
    receive() external payable {}

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
