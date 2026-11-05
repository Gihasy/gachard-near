// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {GachardCards} from "./GachardCards.sol";
import {SigCheck} from "./lib/SigCheck.sol";
import {WindowLimits} from "./lib/WindowLimits.sol";

/**
 * @title GachardAlbums
 * @notice Seasons, album placement, Wish Cards and album rewards (ADR-038), as a
 *         replaceable module.
 * @dev Completion is checked on chain (decision D8): rewards go only to an
 *      address whose album slots are all filled with locked cards of the right
 *      templates. A leaked Relayer key therefore cannot mint rewards to an address
 *      that never completed an album, and with an attestor set (D3) it cannot
 *      complete albums through Wish Cards either.
 *
 *      Rewards (ADR-038 §6, amended 15 October 2026): every completer gets a
 *      numbered, soulbound Completion card. The album's Limited card goes to
 *      completers first come, first served, one per address per season, while
 *      the album share lasts. There is no reservation for the next season.
 */
contract GachardAlbums is AccessControlEnumerable, Pausable, ReentrancyGuard, EIP712, WindowLimits {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    bytes32 public constant LIMIT_WISH = keccak256("LIMIT_WISH");
    bytes32 public constant LIMIT_REWARD = keccak256("LIMIT_REWARD");

    uint256 public constant MAX_SLOTS = 200;
    uint256 public constant MAX_PLACE_BATCH = 50;
    uint256 public constant MAX_SIGNATURE_TTL = 1 hours;

    bytes32 public constant PLACE_TYPEHASH = keccak256(
        "AlbumPlace(address holder,uint256 seasonId,uint256[] ids,uint16[] slots,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant WISH_TYPEHASH =
        keccak256("Wish(address holder,uint256 seasonId,uint16 slot,uint256 nonce,uint256 deadline)");
    bytes32 public constant REWARD_TYPEHASH =
        keccak256("RewardClaim(address holder,uint256 seasonId,uint256 deadline)");

    GachardCards public immutable cards;

    /// @notice Co-signs Wish Cards and reward claims when set (decision D3).
    address public attestor;

    struct Season {
        uint32 seriesId;
        uint32 limitedTemplateId; // 0 when the season has no limited card
        uint32 completionTemplateId;
        uint40 startsAt;
        uint40 endsAt;
        uint16 slotCount;
        uint32 completions;
        bool exists;
    }

    mapping(uint256 seasonId => Season) private _seasons;
    mapping(uint256 seasonId => uint32[]) private _slotTemplates;
    mapping(uint256 seasonId => mapping(address holder => mapping(uint16 slot => uint256 tokenId))) public slotToken;
    mapping(uint256 seasonId => mapping(address holder => uint16)) public filledCount;
    mapping(uint256 seasonId => mapping(address holder => bool)) public rewardClaimed;
    mapping(address holder => mapping(uint256 nonce => bool)) public nonceUsed;

    event AttestorChanged(address indexed attestor);
    event SeasonRegistered(uint256 indexed seasonId, uint32 indexed seriesId, uint16 slotCount, uint40 startsAt, uint40 endsAt);
    event CardsPlaced(uint256 indexed seasonId, address indexed holder, uint256[] ids, uint16[] slots);
    event Wished(uint256 indexed seasonId, address indexed holder, uint16 slot, uint256 tokenId);
    event RewardsClaimed(
        uint256 indexed seasonId, address indexed holder, uint32 serial, uint256 completionTokenId, uint256 limitedTokenId
    );

    error ZeroAddress();
    error BadSeason(uint256 seasonId);
    error SeasonExists(uint256 seasonId);
    error UnknownSeason(uint256 seasonId);
    error SeasonNotActive(uint256 seasonId);
    error BadSlotTemplate(uint256 seasonId, uint16 slot);
    error LengthMismatch();
    error BadBatch(uint256 length);
    error SlotOutOfRange(uint16 slot);
    error SlotTaken(uint16 slot);
    error WrongTemplateForSlot(uint256 tokenId, uint16 slot);
    error AlbumIncomplete(uint16 filled, uint16 needed);
    error AlreadyClaimed(uint256 seasonId, address holder);
    error BadSignature();
    error BadAttestation();
    error SignatureExpired(uint256 deadline);
    error DeadlineTooFar(uint256 deadline);
    error NonceAlreadyUsed(address holder, uint256 nonce);

    constructor(GachardCards cards_, address admin, address guardian, address unpauser)
        EIP712("GachardAlbums", "1")
    {
        if (address(cards_) == address(0) || admin == address(0) || guardian == address(0) || unpauser == address(0)) {
            revert ZeroAddress();
        }
        cards = cards_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
        _grantRole(UNPAUSER_ROLE, unpauser);
    }

    // ═══ Seasons ════════════════════════════════════════════════════════════

    /**
     * @notice Register a season before it starts. Immutable afterwards (ADR-039: locked once Live).
     * @param slotTemplateIds The template each slot takes, by slot number. All Standard, all of this Series.
     */
    function registerSeason(
        uint256 seasonId,
        uint32 seriesId,
        uint32 limitedTemplateId,
        uint32 completionTemplateId,
        uint40 startsAt,
        uint40 endsAt,
        uint32[] calldata slotTemplateIds
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_seasons[seasonId].exists) revert SeasonExists(seasonId);
        uint256 n = slotTemplateIds.length;
        if (n == 0 || n > MAX_SLOTS || startsAt < block.timestamp || endsAt <= startsAt) revert BadSeason(seasonId);

        for (uint256 i = 0; i < n; i++) {
            GachardCards.Template memory t = cards.templateInfo(slotTemplateIds[i]);
            if (!t.exists || t.kind != GachardCards.Kind.Standard || t.seriesId != seriesId) {
                // i < n <= MAX_SLOTS (200), so it fits in uint16.
                // forge-lint: disable-next-line(unsafe-typecast)
                revert BadSlotTemplate(seasonId, uint16(i));
            }
        }
        GachardCards.Template memory completion = cards.templateInfo(completionTemplateId);
        if (!completion.exists || completion.kind != GachardCards.Kind.Completion || completion.seriesId != seriesId) {
            revert BadSeason(seasonId);
        }
        if (limitedTemplateId != 0) {
            GachardCards.Template memory limited = cards.templateInfo(limitedTemplateId);
            if (!limited.exists || limited.kind != GachardCards.Kind.Limited || limited.seriesId != seriesId) {
                revert BadSeason(seasonId);
            }
        }

        // n <= MAX_SLOTS (200), so it fits in uint16.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint16 slotCount = uint16(n);
        _seasons[seasonId] = Season({
            seriesId: seriesId,
            limitedTemplateId: limitedTemplateId,
            completionTemplateId: completionTemplateId,
            startsAt: startsAt,
            endsAt: endsAt,
            slotCount: slotCount,
            completions: 0,
            exists: true
        });
        _slotTemplates[seasonId] = slotTemplateIds;
        emit SeasonRegistered(seasonId, seriesId, slotCount, startsAt, endsAt);
    }

    // ═══ Album placement ════════════════════════════════════════════════════

    /// @notice Place cards into their slots. Permanent: the ledger locks them (ADR-038 §4).
    function placeInAlbum(
        address holder,
        uint256 seasonId,
        uint256[] calldata ids,
        uint16[] calldata slots,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRole(RELAYER_ROLE) whenNotPaused nonReentrant {
        uint256 n = ids.length;
        if (n != slots.length) revert LengthMismatch();
        if (n == 0 || n > MAX_PLACE_BATCH) revert BadBatch(n);
        Season storage s = _activeSeason(seasonId);

        bytes32 structHash = keccak256(
            abi.encode(
                PLACE_TYPEHASH,
                holder,
                seasonId,
                keccak256(abi.encodePacked(ids)),
                keccak256(abi.encodePacked(slots)),
                nonce,
                deadline
            )
        );
        _useHolderSignature(holder, structHash, nonce, deadline, signature);

        uint32[] storage templates = _slotTemplates[seasonId];
        for (uint256 i = 0; i < n; i++) {
            uint16 slot = slots[i];
            if (slot >= s.slotCount) revert SlotOutOfRange(slot);
            if (slotToken[seasonId][holder][slot] != 0) revert SlotTaken(slot);
            if (cards.templateOf(ids[i]) != templates[slot]) revert WrongTemplateForSlot(ids[i], slot);
            slotToken[seasonId][holder][slot] = ids[i];
        }
        // n <= MAX_PLACE_BATCH (50), so it fits in uint16.
        // forge-lint: disable-next-line(unsafe-typecast)
        filledCount[seasonId][holder] += uint16(n);
        cards.lockForAlbum(holder, ids);
        emit CardsPlaced(seasonId, holder, ids, slots);
    }

    /**
     * @notice A Wish Card: mint the slot's card straight into the album, locked.
     * @dev It never reaches the collection, so a discounted Wish cannot be resold
     *      (ADR-038 amendment, 15 October 2026). Slots only ever hold Standard
     *      templates, so a Wish Card can never pick a limited card.
     *      The Crystal price, including the season-end catch-up, is charged off chain.
     */
    function wishIntoAlbum(
        address holder,
        uint256 seasonId,
        uint16 slot,
        uint256 nonce,
        uint256 deadline,
        bytes calldata holderSignature,
        bytes calldata attestation
    ) external onlyRole(RELAYER_ROLE) whenNotPaused nonReentrant returns (uint256 tokenId) {
        Season storage s = _activeSeason(seasonId);
        if (slot >= s.slotCount) revert SlotOutOfRange(slot);
        if (slotToken[seasonId][holder][slot] != 0) revert SlotTaken(slot);

        bytes32 structHash = keccak256(abi.encode(WISH_TYPEHASH, holder, seasonId, slot, nonce, deadline));
        _useHolderSignature(holder, structHash, nonce, deadline, holderSignature);
        _checkAttestation(structHash, attestation);
        _consume(LIMIT_WISH, msg.sender, 1);

        // Effects before interactions. Minting calls the holder's ERC-1155 receiver
        // hook, so the slot is marked taken first: anything re-entering during the
        // mint sees it filled. If the holder moves the new card away inside that
        // hook, lockForAlbum below reverts and the whole Wish is undone.
        slotToken[seasonId][holder][slot] = type(uint256).max;
        filledCount[seasonId][holder] += 1;

        uint32[] memory template = new uint32[](1);
        template[0] = _slotTemplates[seasonId][slot];
        tokenId = cards.mint(holder, template, GachardCards.Channel.Album);
        uint256[] memory ids = new uint256[](1);
        ids[0] = tokenId;
        cards.lockForAlbum(holder, ids);

        slotToken[seasonId][holder][slot] = tokenId;
        emit Wished(seasonId, holder, slot, tokenId);
    }

    // ═══ Rewards ════════════════════════════════════════════════════════════

    /// @notice Completion card always; the Limited card while the album share lasts. Once per address per season.
    function claimRewards(address holder, uint256 seasonId, uint256 deadline, bytes calldata attestation)
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256 completionTokenId, uint256 limitedTokenId)
    {
        Season storage s = _seasons[seasonId];
        if (!s.exists) revert UnknownSeason(seasonId);
        uint16 filled = filledCount[seasonId][holder];
        if (filled != s.slotCount) revert AlbumIncomplete(filled, s.slotCount);
        if (rewardClaimed[seasonId][holder]) revert AlreadyClaimed(seasonId, holder);

        if (attestor != address(0)) {
            if (block.timestamp > deadline) revert SignatureExpired(deadline);
            if (deadline > block.timestamp + MAX_SIGNATURE_TTL) revert DeadlineTooFar(deadline);
        }
        _checkAttestation(keccak256(abi.encode(REWARD_TYPEHASH, holder, seasonId, deadline)), attestation);
        _consume(LIMIT_REWARD, msg.sender, 1);

        rewardClaimed[seasonId][holder] = true;
        uint32 serial = ++s.completions;
        completionTokenId = cards.mintCompletion(holder, s.completionTemplateId, serial);

        if (
            s.limitedTemplateId != 0
                && cards.remaining(s.limitedTemplateId, GachardCards.Channel.Album) > 0
        ) {
            uint32[] memory template = new uint32[](1);
            template[0] = s.limitedTemplateId;
            limitedTokenId = cards.mint(holder, template, GachardCards.Channel.Album);
        }
        emit RewardsClaimed(seasonId, holder, serial, completionTokenId, limitedTokenId);
    }

    // ═══ Views ══════════════════════════════════════════════════════════════

    function season(uint256 seasonId) external view returns (Season memory) {
        return _seasons[seasonId];
    }

    function slotTemplates(uint256 seasonId) external view returns (uint32[] memory) {
        return _slotTemplates[seasonId];
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

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ═══ Internals ══════════════════════════════════════════════════════════

    function _activeSeason(uint256 seasonId) private view returns (Season storage s) {
        s = _seasons[seasonId];
        if (!s.exists) revert UnknownSeason(seasonId);
        if (block.timestamp < s.startsAt || block.timestamp > s.endsAt) revert SeasonNotActive(seasonId);
    }

    function _useHolderSignature(
        address holder,
        bytes32 structHash,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) private {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        if (deadline > block.timestamp + MAX_SIGNATURE_TTL) revert DeadlineTooFar(deadline);
        if (nonceUsed[holder][nonce]) revert NonceAlreadyUsed(holder, nonce);
        nonceUsed[holder][nonce] = true;
        if (!SigCheck.isValidNow(holder, _hashTypedDataV4(structHash), signature)) revert BadSignature();
    }

    function _checkAttestation(bytes32 structHash, bytes calldata attestation) private view {
        if (attestor == address(0)) return;
        if (!SigCheck.isValidNow(attestor, _hashTypedDataV4(structHash), attestation)) revert BadAttestation();
    }
}
