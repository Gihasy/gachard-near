// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SigCheck} from "./lib/SigCheck.sol";
import {WindowLimits} from "./lib/WindowLimits.sol";

/**
 * @title GachardCards
 * @notice The card ledger: who holds which card, and the rules for moving it.
 * @dev ADR-040 and docs/CONTRACT-V2-SPEC.md. Immutable, no proxy: this is the
 *      one contract users have to trust forever, so it stays small and never
 *      changes. Business flows live in replaceable modules (GachardStore,
 *      GachardAlbums) that hold MINTER_ROLE and STATUS_ROLE here.
 *
 *      - Moving or burning a card needs the holder's EIP-712 signature. A
 *        leaked Relayer key alone cannot take or destroy anyone's card.
 *      - Every rule about what a card may do is enforced in `_update`, so a
 *        holder's own `safeTransferFrom` obeys it too.
 *      - Pausing stops the privileged paths only. A holder's own transfer of
 *        a Digital card is never paused (decision D2).
 */
contract GachardCards is
    ERC1155,
    ERC2981,
    AccessControlEnumerable,
    Pausable,
    ReentrancyGuard,
    EIP712,
    WindowLimits
{
    // ─── Roles ──────────────────────────────────────────────────────────────
    // DEFAULT_ADMIN_ROLE: the TimelockController, proposed by the Safe.
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant STATUS_ROLE = keccak256("STATUS_ROLE");

    // ─── Limits (per hour, per caller) ──────────────────────────────────────
    bytes32 public constant LIMIT_MINT = keccak256("LIMIT_MINT");
    bytes32 public constant LIMIT_TRANSFER = keccak256("LIMIT_TRANSFER");
    bytes32 public constant LIMIT_BURN = keccak256("LIMIT_BURN");
    bytes32 public constant LIMIT_REDEEM = keccak256("LIMIT_REDEEM");

    /// @notice A whole shelf with Expansion: 5 packs of 5 cards.
    uint256 public constant MAX_BATCH = 25;
    /// @notice A holder's signature may not be valid for longer than this.
    uint256 public constant MAX_SIGNATURE_TTL = 1 hours;

    // ─── EIP-712 types ──────────────────────────────────────────────────────
    bytes32 public constant TRANSFER_TYPEHASH =
        keccak256("TransferBatch(address from,address to,uint256[] ids,uint256 nonce,uint256 deadline)");
    bytes32 public constant BURN_TYPEHASH =
        keccak256("BurnBatch(address holder,uint256[] ids,uint256 nonce,uint256 deadline)");
    bytes32 public constant PRINT_TYPEHASH =
        keccak256("PrintRequest(address holder,uint256 id,bytes32 commit,uint256 nonce,uint256 deadline)");
    bytes32 public constant PRINT_CANCEL_TYPEHASH =
        keccak256("PrintCancel(address holder,uint256 id,uint256 nonce,uint256 deadline)");

    // ─── Model ──────────────────────────────────────────────────────────────
    enum Kind {
        Standard, // album and shelf cards
        Limited, // fixed supply, never burned
        Completion // soulbound, numbered
    }

    enum Status {
        Digital,
        PrintLocked, // v1's Vaulted: locked in place while it is a physical card
        AlbumLocked // permanent
    }

    /// @notice Where a limited card is minted from, which decides whose share it uses.
    enum Channel {
        Store,
        Album
    }

    struct Template {
        uint32 seriesId;
        uint8 rarity; // 0 Common, 1 Rare, 2 Epic, 3 Legendary
        Kind kind;
        bool exists;
        bool live; // set once, when the season launches; frozen from then on
        uint32 albumCap; // Limited only
        uint32 storeCap; // Limited only
        uint32 albumMinted;
        uint32 storeMinted;
        uint32 minted;
    }

    struct Card {
        uint32 templateId;
        Status status;
        uint32 printCycle;
        uint32 serial; // Completion cards only
        uint40 mintedAt;
    }

    uint256 public nextTokenId = 1;

    mapping(uint32 templateId => Template) private _templates;
    mapping(uint256 tokenId => Card) private _cards;

    /// @notice The one address holding each card. Zero once burned.
    mapping(uint256 tokenId => address) public holderOf;
    /// @notice keccak256(abi.encode(tokenId, printCycle, bytes(code))) for a card being printed.
    mapping(uint256 tokenId => bytes32) public printCommitOf;
    /// @notice Unordered nonces, so several signed requests can be in flight at once (ADR-018).
    mapping(address holder => mapping(uint256 nonce => bool)) public nonceUsed;

    // ─── Events ─────────────────────────────────────────────────────────────
    event TemplateRegistered(uint32 indexed templateId, uint32 indexed seriesId, uint8 rarity, Kind kind, uint32 albumCap, uint32 storeCap);
    event TemplateLive(uint32 indexed templateId);
    event CardMinted(uint256 indexed tokenId, address indexed to, uint32 indexed templateId, uint32 serial);
    event CardBurned(uint256 indexed tokenId, address indexed holder, uint32 indexed templateId);
    event StatusChanged(uint256 indexed tokenId, Status from, Status to);
    event RelayedTransfer(address indexed from, address indexed to, uint256[] ids);
    event PrintRequested(uint256 indexed tokenId, address indexed holder, uint32 printCycle);
    event PrintCancelled(uint256 indexed tokenId, address indexed holder, uint32 printCycle);
    event Redeemed(uint256 indexed tokenId, address indexed from, address indexed to, uint32 printCycle);
    event RiskRecorded(uint256 indexed tokenId, uint8 score, bool flagged);
    event URIChanged(string newUri);

    // ─── Errors ─────────────────────────────────────────────────────────────
    error ZeroAddress();
    error BadBatch(uint256 length);
    error LengthMismatch();
    error UnknownTemplate(uint32 templateId);
    error TemplateIsLive(uint32 templateId);
    error TemplateNotLive(uint32 templateId);
    error BadTemplate(uint32 templateId);
    error SupplyExhausted(uint32 templateId, Channel channel);
    error WrongKind(uint256 tokenId);
    error WrongStatus(uint256 tokenId, Status status);
    error Soulbound(uint256 tokenId);
    error NotBurnable(uint256 tokenId);
    error NotHolder(uint256 tokenId, address account);
    error InvalidAmount(uint256 tokenId, uint256 amount);
    error BadSignature();
    error SignatureExpired(uint256 deadline);
    error DeadlineTooFar(uint256 deadline);
    error NonceAlreadyUsed(address holder, uint256 nonce);
    error BadRedeemCode(uint256 tokenId);
    error EmptyCommit();
    error NotOperationalRole(bytes32 role);
    error ModuleRoleNeedsContract(bytes32 role, address account);
    error ScoreOutOfRange(uint8 score);

    /**
     * @param admin     DEFAULT_ADMIN_ROLE. In production the TimelockController.
     *                  The deploy script may pass itself, configure, then hand over.
     * @param guardian  Cold key: pause, lower limits, revoke hot roles.
     * @param unpauser  The Safe, directly (no timelock), so a false alarm costs minutes.
     */
    constructor(address admin, address guardian, address unpauser)
        ERC1155("") // ADR-033: empty metadata until decided otherwise; see setURI
        EIP712("GachardCards", "1")
    {
        if (admin == address(0) || guardian == address(0) || unpauser == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
        _grantRole(UNPAUSER_ROLE, unpauser);
    }

    // ═══ Templates ══════════════════════════════════════════════════════════

    /// @notice Register or edit a template. Editable only until it goes live.
    function registerTemplate(
        uint32 templateId,
        uint32 seriesId,
        uint8 rarity,
        Kind kind,
        uint32 albumCap,
        uint32 storeCap
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (templateId == 0 || rarity > 3) revert BadTemplate(templateId);
        Template storage t = _templates[templateId];
        if (t.live) revert TemplateIsLive(templateId);
        if (kind == Kind.Limited) {
            if (uint256(albumCap) + storeCap == 0) revert BadTemplate(templateId);
        } else if (albumCap != 0 || storeCap != 0) {
            revert BadTemplate(templateId);
        }
        t.seriesId = seriesId;
        t.rarity = rarity;
        t.kind = kind;
        t.exists = true;
        t.albumCap = albumCap;
        t.storeCap = storeCap;
        emit TemplateRegistered(templateId, seriesId, rarity, kind, albumCap, storeCap);
    }

    /// @notice Launch templates. Irreversible: once live, rarity, kind and supply are frozen (ADR-039).
    function setTemplatesLive(uint32[] calldata templateIds) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < templateIds.length; i++) {
            Template storage t = _templates[templateIds[i]];
            if (!t.exists) revert UnknownTemplate(templateIds[i]);
            if (!t.live) {
                t.live = true;
                emit TemplateLive(templateIds[i]);
            }
        }
    }

    // ═══ Minting (modules only) ═════════════════════════════════════════════

    /**
     * @notice Mint one card per template to `to`.
     * @dev Limited cards draw on the share named by `channel`. Completion cards
     *      have their own function, because they carry a serial number.
     */
    function mint(address to, uint32[] calldata templateIds, Channel channel)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256 firstId)
    {
        uint256 n = templateIds.length;
        if (n == 0 || n > MAX_BATCH) revert BadBatch(n);
        if (to == address(0)) revert ZeroAddress();
        _consume(LIMIT_MINT, msg.sender, n);

        firstId = nextTokenId;
        nextTokenId = firstId + n;
        uint256[] memory ids = new uint256[](n);
        uint256[] memory values = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            uint32 templateId = templateIds[i];
            Template storage t = _templates[templateId];
            if (!t.exists) revert UnknownTemplate(templateId);
            if (!t.live) revert TemplateNotLive(templateId);
            if (t.kind == Kind.Completion) revert BadTemplate(templateId);
            if (t.kind == Kind.Limited) {
                if (channel == Channel.Store) {
                    if (t.storeMinted >= t.storeCap) revert SupplyExhausted(templateId, channel);
                    t.storeMinted += 1;
                } else {
                    if (t.albumMinted >= t.albumCap) revert SupplyExhausted(templateId, channel);
                    t.albumMinted += 1;
                }
            }
            t.minted += 1;

            uint256 id = firstId + i;
            ids[i] = id;
            values[i] = 1;
            _cards[id] = Card({
                templateId: templateId,
                status: Status.Digital,
                printCycle: 0,
                serial: 0,
                mintedAt: uint40(block.timestamp)
            });
            emit CardMinted(id, to, templateId, 0);
        }

        _mintBatch(to, ids, values, "");
    }

    /// @notice Mint a numbered, soulbound Completion card.
    function mintCompletion(address to, uint32 templateId, uint32 serial)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256 id)
    {
        if (to == address(0)) revert ZeroAddress();
        Template storage t = _templates[templateId];
        if (!t.exists) revert UnknownTemplate(templateId);
        if (!t.live) revert TemplateNotLive(templateId);
        if (t.kind != Kind.Completion) revert BadTemplate(templateId);
        _consume(LIMIT_MINT, msg.sender, 1);

        t.minted += 1;
        id = nextTokenId++;
        _cards[id] = Card({
            templateId: templateId,
            status: Status.Digital,
            printCycle: 0,
            serial: serial,
            mintedAt: uint40(block.timestamp)
        });
        emit CardMinted(id, to, templateId, serial);
        _mint(to, id, 1, "");
    }

    // ═══ Holder-signed actions (Relayer submits) ════════════════════════════

    /// @notice Trade sales and exports. Replaces v1's unsigned `marketplaceTransfer`.
    function transferWithSig(
        address from,
        address to,
        uint256[] calldata ids,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRole(RELAYER_ROLE) whenNotPaused nonReentrant {
        uint256 n = ids.length;
        if (n == 0 || n > MAX_BATCH) revert BadBatch(n);
        if (to == address(0)) revert ZeroAddress();
        _useSignature(
            from,
            keccak256(abi.encode(TRANSFER_TYPEHASH, from, to, keccak256(abi.encodePacked(ids)), nonce, deadline)),
            nonce,
            deadline,
            signature
        );
        _consume(LIMIT_TRANSFER, msg.sender, n);
        _safeBatchTransferFrom(from, to, ids, _ones(n), "");
        emit RelayedTransfer(from, to, ids);
    }

    /// @notice Dismantle. Standard cards only; `_update` refuses the rest.
    function burnWithSig(
        address holder,
        uint256[] calldata ids,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRole(RELAYER_ROLE) whenNotPaused nonReentrant {
        uint256 n = ids.length;
        if (n == 0 || n > MAX_BATCH) revert BadBatch(n);
        _useSignature(
            holder,
            keccak256(abi.encode(BURN_TYPEHASH, holder, keccak256(abi.encodePacked(ids)), nonce, deadline)),
            nonce,
            deadline,
            signature
        );
        _consume(LIMIT_BURN, msg.sender, n);
        for (uint256 i = 0; i < n; i++) {
            emit CardBurned(ids[i], holder, _cards[ids[i]].templateId);
        }
        _burnBatch(holder, ids, _ones(n));
    }

    /**
     * @notice Lock a card in place for printing (v1's Vaulted).
     * @param commit keccak256(abi.encode(tokenId, printCycle + 1, bytes(code))). The
     *               code itself never reaches the chain until it is redeemed (ADR-005).
     */
    function requestPrintWithSig(
        address holder,
        uint256 id,
        bytes32 commit,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRole(RELAYER_ROLE) whenNotPaused nonReentrant {
        if (commit == bytes32(0)) revert EmptyCommit();
        _useSignature(
            holder,
            keccak256(abi.encode(PRINT_TYPEHASH, holder, id, commit, nonce, deadline)),
            nonce,
            deadline,
            signature
        );
        if (holderOf[id] != holder) revert NotHolder(id, holder);
        Card storage c = _cards[id];
        if (_templates[c.templateId].kind == Kind.Completion) revert Soulbound(id);
        if (c.status != Status.Digital) revert WrongStatus(id, c.status);

        c.printCycle += 1;
        c.status = Status.PrintLocked;
        printCommitOf[id] = commit;
        emit StatusChanged(id, Status.Digital, Status.PrintLocked);
        emit PrintRequested(id, holder, c.printCycle);
    }

    /// @notice Undo a print before it ships.
    function cancelPrintWithSig(
        address holder,
        uint256 id,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRole(RELAYER_ROLE) whenNotPaused nonReentrant {
        _useSignature(
            holder,
            keccak256(abi.encode(PRINT_CANCEL_TYPEHASH, holder, id, nonce, deadline)),
            nonce,
            deadline,
            signature
        );
        if (holderOf[id] != holder) revert NotHolder(id, holder);
        Card storage c = _cards[id];
        if (c.status != Status.PrintLocked) revert WrongStatus(id, c.status);

        c.status = Status.Digital;
        delete printCommitOf[id];
        emit StatusChanged(id, Status.PrintLocked, Status.Digital);
        emit PrintCancelled(id, holder, c.printCycle);
    }

    /**
     * @notice Turn a physical card back into a digital one, for whoever holds the code.
     * @dev The code is the bearer credential (ADR-007): the card goes to `recipient`,
     *      the account that entered it. The contract checks the code itself, not a
     *      public hash anyone could copy (v1's flaw, ADR-036). Seeing the code in this
     *      transaction afterwards gives nothing away: it is consumed here.
     */
    function redeem(uint256 id, bytes calldata code, address recipient)
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        Card storage c = _cards[id];
        if (c.status != Status.PrintLocked) revert WrongStatus(id, c.status);
        if (keccak256(abi.encode(id, c.printCycle, code)) != printCommitOf[id]) revert BadRedeemCode(id);
        _consume(LIMIT_REDEEM, msg.sender, 1);

        address from = holderOf[id];
        c.status = Status.Digital;
        delete printCommitOf[id];
        emit StatusChanged(id, Status.PrintLocked, Status.Digital);
        emit Redeemed(id, from, recipient, c.printCycle);
        if (from != recipient) _safeTransferFrom(from, recipient, id, 1, "");
    }

    // ═══ Album lock (Albums module) ═════════════════════════════════════════

    /// @notice Lock cards into an album, permanently. The module has checked the holder's signature.
    function lockForAlbum(address holder, uint256[] calldata ids) external onlyRole(STATUS_ROLE) whenNotPaused {
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            if (holderOf[id] != holder) revert NotHolder(id, holder);
            Card storage c = _cards[id];
            if (_templates[c.templateId].kind != Kind.Standard) revert WrongKind(id);
            if (c.status != Status.Digital) revert WrongStatus(id, c.status);
            c.status = Status.AlbumLocked;
            emit StatusChanged(id, Status.Digital, Status.AlbumLocked);
        }
    }

    // ═══ Records ════════════════════════════════════════════════════════════

    /// @notice The Trade risk check (ADR-024). An event only: nothing on chain reads it.
    function recordRisk(uint256 id, uint8 score, bool flagged) external onlyRole(RELAYER_ROLE) {
        if (score > 100) revert ScoreOutOfRange(score);
        emit RiskRecorded(id, score, flagged);
    }

    // ═══ Safety controls ════════════════════════════════════════════════════

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(UNPAUSER_ROLE) {
        _unpause();
    }

    /// @notice Raise or set a limit. Slow: through the timelock.
    function setLimit(bytes32 action, uint64 max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setLimit(action, max);
    }

    /// @notice Lower a limit. Fast: the Guardian, at once.
    function lowerLimit(bytes32 action, uint64 max) external onlyRole(GUARDIAN_ROLE) {
        _lowerLimit(action, max);
    }

    /// @notice Revoke a hot role at once. Granting stays slow, through the timelock.
    function emergencyRevoke(bytes32 role, address account) external onlyRole(GUARDIAN_ROLE) {
        if (role != RELAYER_ROLE && role != MINTER_ROLE && role != STATUS_ROLE) revert NotOperationalRole(role);
        _revokeRole(role, account);
    }

    /// @notice ADR-033 keeps this empty. Setting it is a decision, not a code change.
    function setURI(string calldata newUri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newUri);
        emit URIChanged(newUri);
    }

    /// @notice ERC-2981, for the self-custody marketplace fee of ADR-034 (D6). Unset means 0%.
    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    // ═══ Views ══════════════════════════════════════════════════════════════

    function templateOf(uint256 id) external view returns (uint32) {
        return _cards[id].templateId;
    }

    function cardOf(uint256 id) external view returns (Card memory) {
        return _cards[id];
    }

    function templateInfo(uint32 templateId) external view returns (Template memory) {
        return _templates[templateId];
    }

    /// @notice Limited cards left in a share. Zero for templates without a supply.
    function remaining(uint32 templateId, Channel channel) external view returns (uint256) {
        Template storage t = _templates[templateId];
        if (t.kind != Kind.Limited) return 0;
        return channel == Channel.Store ? t.storeCap - t.storeMinted : t.albumCap - t.albumMinted;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC2981, AccessControlEnumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ═══ Internals ══════════════════════════════════════════════════════════

    /**
     * @dev The single place every rule about moving a card is enforced, for every path.
     *      Amounts must be exactly 1: v1 accepted a zero-value transfer of any card
     *      and still rewrote `lastOwner`, so anyone could make the chain report a
     *      false last owner. Here a zero-value transfer reverts.
     */
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        for (uint256 i = 0; i < ids.length; i++) {
            if (values[i] != 1) revert InvalidAmount(ids[i], values[i]);
            if (from != address(0)) {
                Card storage c = _cards[ids[i]];
                Kind kind = _templates[c.templateId].kind;
                if (kind == Kind.Completion) revert Soulbound(ids[i]);
                if (c.status != Status.Digital) revert WrongStatus(ids[i], c.status);
                if (to == address(0) && kind == Kind.Limited) revert NotBurnable(ids[i]);
            }
        }
        super._update(from, to, ids, values);
        for (uint256 i = 0; i < ids.length; i++) {
            holderOf[ids[i]] = to;
        }
    }

    /// @dev Module roles only ever go to contracts, never to a person's key.
    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if ((role == MINTER_ROLE || role == STATUS_ROLE) && account.code.length == 0) {
            revert ModuleRoleNeedsContract(role, account);
        }
        return super._grantRole(role, account);
    }

    function _useSignature(
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

    function _ones(uint256 n) private pure returns (uint256[] memory values) {
        values = new uint256[](n);
        for (uint256 i = 0; i < n; i++) values[i] = 1;
    }

    /// @notice The EIP-712 domain separator, for off-chain signers.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
