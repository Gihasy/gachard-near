// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {GachardCards} from "./GachardCards.sol";

/// @notice The two v1 reads migration needs (contracts/src/GachardCard.sol).
interface IGachardCardV1 {
    function cardStatus(uint256 tokenId) external view returns (uint8); // 0 Digital, 1 Vaulted
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

/**
 * @title MigrationMinter
 * @notice One-off module that re-mints v1 cards into v2 (docs/CONTRACT-V2-SPEC.md §17).
 * @dev Every entry comes from a snapshot committed as a Merkle root at deploy
 *      (OpenZeppelin StandardMerkleTree leaf encoding), and every mint is
 *      checked against v1's live state, so a card that moved after the
 *      snapshot is not minted to its old holder.
 *
 *      Physical cards printed under v1 had their redeem codes committed with
 *      NIST SHA3-256 (frontend/lib/redeem-code.ts), which Solidity cannot
 *      compute, so v1's commitment cannot be carried over. The codes themselves
 *      are kept AES-encrypted in `redeem_codes` so they can be printed, which
 *      gives two paths (docs/CONTRACT-V2-SPEC.md §17):
 *      - `migratePrinted` (preferred): mint the twin to the holder while v1
 *        still shows the card printed. The backend then locks it again on v2
 *        with a holder-signed print request whose commitment is built from the
 *        same decrypted code, so the card in someone's hand keeps working. v1
 *        must be retired at cutover, or the same code would redeem twice.
 *      - `migrateRedeemed` (fallback, for a code that cannot be decrypted): the
 *        card keeps redeeming on v1, and its twin is minted to whoever holds it
 *        once it is Digital again there. The code stays the bearer credential
 *        (ADR-007).
 *
 *      When migration is done, `retire` makes this contract renounce MINTER_ROLE
 *      on the ledger itself. Retiring removes power, so the Guardian may do it at once.
 */
contract MigrationMinter is AccessControlEnumerable, ReentrancyGuard {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    uint8 public constant ENTRY_DIGITAL = 0;
    uint8 public constant ENTRY_LEGACY_PRINT = 1;
    uint256 public constant MAX_BATCH = 25;

    GachardCards public immutable cards;
    IGachardCardV1 public immutable v1;
    /// @notice Root of (v1TokenId, holder, templateId, kind) leaves.
    bytes32 public immutable root;

    mapping(uint256 v1TokenId => uint256 v2TokenId) public migratedTo;
    bool public retired;

    struct Entry {
        uint256 v1TokenId;
        address holder; // the v1 holder at the snapshot
        uint32 templateId;
        uint8 kind;
        bytes32[] proof;
    }

    event Migrated(uint256 indexed v1TokenId, uint256 indexed v2TokenId, address indexed to, uint8 kind);
    event Retired();

    error ZeroAddress();
    error BadBatch(uint256 length);
    error AlreadyMigrated(uint256 v1TokenId);
    error BadProof(uint256 v1TokenId);
    error WrongKind(uint256 v1TokenId, uint8 kind);
    error NotHeldOnV1(uint256 v1TokenId, address account);
    error StillPrintedOnV1(uint256 v1TokenId);
    error NotPrintedOnV1(uint256 v1TokenId);
    error IsRetired();

    constructor(GachardCards cards_, IGachardCardV1 v1_, bytes32 root_, address admin, address guardian) {
        if (address(cards_) == address(0) || address(v1_) == address(0) || admin == address(0) || guardian == address(0)) {
            revert ZeroAddress();
        }
        cards = cards_;
        v1 = v1_;
        root = root_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
    }

    /// @notice Digital v1 cards: mint each to the holder that still holds it on v1.
    function migrate(Entry[] calldata entries) external onlyRole(RELAYER_ROLE) nonReentrant {
        if (retired) revert IsRetired();
        uint256 n = entries.length;
        if (n == 0 || n > MAX_BATCH) revert BadBatch(n);
        for (uint256 i = 0; i < n; i++) {
            Entry calldata e = entries[i];
            if (e.kind != ENTRY_DIGITAL) revert WrongKind(e.v1TokenId, e.kind);
            _verify(e);
            if (v1.balanceOf(e.holder, e.v1TokenId) != 1) revert NotHeldOnV1(e.v1TokenId, e.holder);
            _mint(e.v1TokenId, e.holder, e.templateId, e.kind);
        }
    }

    /// @notice A card still printed on v1: mint its twin to the same holder, to be locked again on v2.
    function migratePrinted(Entry[] calldata entries) external onlyRole(RELAYER_ROLE) nonReentrant {
        if (retired) revert IsRetired();
        uint256 n = entries.length;
        if (n == 0 || n > MAX_BATCH) revert BadBatch(n);
        for (uint256 i = 0; i < n; i++) {
            Entry calldata e = entries[i];
            if (e.kind != ENTRY_LEGACY_PRINT) revert WrongKind(e.v1TokenId, e.kind);
            _verify(e);
            if (v1.cardStatus(e.v1TokenId) != 1) revert NotPrintedOnV1(e.v1TokenId);
            if (v1.balanceOf(e.holder, e.v1TokenId) != 1) revert NotHeldOnV1(e.v1TokenId, e.holder);
            _mint(e.v1TokenId, e.holder, e.templateId, e.kind);
        }
    }

    /// @notice A v1 physical card that has since been redeemed on v1: mint its twin to the new holder.
    function migrateRedeemed(Entry calldata e, address recipient) external onlyRole(RELAYER_ROLE) nonReentrant {
        if (retired) revert IsRetired();
        if (e.kind != ENTRY_LEGACY_PRINT) revert WrongKind(e.v1TokenId, e.kind);
        _verify(e);
        if (v1.cardStatus(e.v1TokenId) != 0) revert StillPrintedOnV1(e.v1TokenId);
        if (v1.balanceOf(recipient, e.v1TokenId) != 1) revert NotHeldOnV1(e.v1TokenId, recipient);
        _mint(e.v1TokenId, recipient, e.templateId, e.kind);
    }

    /// @notice Give up minting for good. Removes power, so the Guardian may do it instantly.
    function retire() external {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !hasRole(GUARDIAN_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, GUARDIAN_ROLE);
        }
        retired = true;
        cards.renounceRole(cards.MINTER_ROLE(), address(this));
        emit Retired();
    }

    /// @notice The leaf encoding of OpenZeppelin's StandardMerkleTree.
    function leafOf(uint256 v1TokenId, address holder, uint32 templateId, uint8 kind) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(v1TokenId, holder, templateId, kind))));
    }

    function _verify(Entry calldata e) private view {
        if (migratedTo[e.v1TokenId] != 0) revert AlreadyMigrated(e.v1TokenId);
        if (!MerkleProof.verifyCalldata(e.proof, root, leafOf(e.v1TokenId, e.holder, e.templateId, e.kind))) {
            revert BadProof(e.v1TokenId);
        }
    }

    function _mint(uint256 v1TokenId, address to, uint32 templateId, uint8 kind) private {
        uint32[] memory template = new uint32[](1);
        template[0] = templateId;
        // Recorded as minted before the call: the ledger's receiver hook cannot replay it.
        migratedTo[v1TokenId] = type(uint256).max;
        uint256 v2TokenId = cards.mint(to, template, GachardCards.Channel.Store);
        migratedTo[v1TokenId] = v2TokenId;
        emit Migrated(v1TokenId, v2TokenId, to, kind);
    }
}
