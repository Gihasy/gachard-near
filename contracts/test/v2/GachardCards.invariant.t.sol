// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {GachardCards} from "../../src/v2/GachardCards.sol";

/// @notice Drives the ledger with random sequences of honest and hostile actions.
contract CardsHandler is Test, ERC1155Holder {
    GachardCards internal immutable cards;
    address public immutable relayer;
    uint256 internal immutable relayerKey;

    uint32 internal constant T_COMMON = 101;
    uint32 internal constant T_RARE = 103;
    uint32 internal constant T_LIMITED = 201;
    uint32 internal constant T_COMPLETION = 301;

    address[] internal actors;
    mapping(address => uint256) internal keyOf;

    uint256[] public tokenIds;
    uint256[] public lockedIds;
    mapping(uint256 => address) public lockedHolder;
    uint256[] public completionIds;
    mapping(uint256 => address) public completionHolder;

    /// @notice How many honest actions really succeeded, so a passing run is not a vacuous one.
    uint256 public okHolderTransfers;
    uint256 public okRelayedTransfers;
    uint256 public okBurns;
    uint256 public okLocks;

    uint256 internal nonce = 1;
    uint32 internal serial;

    constructor(GachardCards cards_, address relayer_, uint256 relayerKey_) {
        cards = cards_;
        relayer = relayer_;
        relayerKey = relayerKey_;
        for (uint256 i = 1; i <= 3; i++) {
            uint256 key = 0xBEEF00 + i;
            address actor = vm.addr(key);
            actors.push(actor);
            keyOf[actor] = key;
        }
    }

    function tokenCount() external view returns (uint256) {
        return tokenIds.length;
    }

    function lockedCount() external view returns (uint256) {
        return lockedIds.length;
    }

    function completionCount() external view returns (uint256) {
        return completionIds.length;
    }

    // ─── Honest actions ─────────────────────────────────────────────────────

    function mintStandard(uint256 actorSeed, bool rare) external {
        uint32[] memory t = new uint32[](1);
        t[0] = rare ? T_RARE : T_COMMON;
        tokenIds.push(cards.mint(_actor(actorSeed), t, GachardCards.Channel.Store));
    }

    function mintLimited(uint256 actorSeed, bool album) external {
        uint32[] memory t = new uint32[](1);
        t[0] = T_LIMITED;
        GachardCards.Channel channel = album ? GachardCards.Channel.Album : GachardCards.Channel.Store;
        try cards.mint(_actor(actorSeed), t, channel) returns (uint256 id) {
            tokenIds.push(id);
        } catch {}
    }

    function mintCompletion(uint256 actorSeed) external {
        address to = _actor(actorSeed);
        uint256 id = cards.mintCompletion(to, T_COMPLETION, ++serial);
        completionIds.push(id);
        completionHolder[id] = to;
    }

    function holderTransfer(uint256 tokenSeed, uint256 toSeed) external {
        (bool ok, uint256 id, address from) = _pick(tokenSeed);
        if (!ok) return;
        vm.prank(from);
        try cards.safeTransferFrom(from, _actor(toSeed), id, 1, "") {
            okHolderTransfers++;
        } catch {}
    }

    function relayedTransfer(uint256 tokenSeed, uint256 toSeed) external {
        (bool ok, uint256 id, address from) = _pick(tokenSeed);
        if (!ok) return;
        if (_relayedTransfer(keyOf[from], from, _actor(toSeed), id)) okRelayedTransfers++;
    }

    function burn(uint256 tokenSeed) external {
        (bool ok, uint256 id, address holder) = _pick(tokenSeed);
        if (!ok) return;
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        uint256 deadline = block.timestamp + 10 minutes;
        uint256 n = nonce++;
        bytes32 structHash =
            keccak256(abi.encode(cards.BURN_TYPEHASH(), holder, keccak256(abi.encodePacked(ids)), n, deadline));
        bytes memory sig = _sign(keyOf[holder], structHash);
        vm.prank(relayer);
        try cards.burnWithSig(holder, ids, n, deadline, sig) {
            okBurns++;
        } catch {}
    }

    function lockAlbum(uint256 tokenSeed) external {
        (bool ok, uint256 id, address holder) = _pick(tokenSeed);
        if (!ok) return;
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        try cards.lockForAlbum(holder, ids) {
            lockedIds.push(id);
            lockedHolder[id] = holder;
            okLocks++;
        } catch {}
    }

    // ─── Hostile actions ────────────────────────────────────────────────────

    /// @dev The relayer signs for itself instead of the holder: must never move a card.
    function forgedTransfer(uint256 tokenSeed) external {
        (bool ok, uint256 id, address from) = _pick(tokenSeed);
        if (!ok) return;
        _relayedTransfer(relayerKey, from, relayer, id);
    }

    /// @dev v1 let anyone rewrite lastOwner this way.
    function zeroValueTransfer(uint256 tokenSeed, uint256 attackerSeed) external {
        (bool ok, uint256 id, ) = _pick(tokenSeed);
        if (!ok) return;
        address attacker = _actor(attackerSeed);
        vm.prank(attacker);
        try cards.safeTransferFrom(attacker, actors[0], id, 0, "") {} catch {}
    }

    function moveCompletion(uint256 seed, uint256 toSeed) external {
        if (completionIds.length == 0) return;
        uint256 id = completionIds[seed % completionIds.length];
        address from = cards.holderOf(id);
        vm.prank(from);
        try cards.safeTransferFrom(from, _actor(toSeed), id, 1, "") {} catch {}
    }

    // ─── Internals ──────────────────────────────────────────────────────────

    function _relayedTransfer(uint256 signerKey, address from, address to, uint256 id) internal returns (bool ok) {
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        uint256 deadline = block.timestamp + 10 minutes;
        uint256 n = nonce++;
        bytes32 structHash = keccak256(
            abi.encode(cards.TRANSFER_TYPEHASH(), from, to, keccak256(abi.encodePacked(ids)), n, deadline)
        );
        bytes memory sig = _sign(signerKey, structHash);
        vm.prank(relayer);
        try cards.transferWithSig(from, to, ids, n, deadline, sig) {
            ok = true;
        } catch {}
    }

    function _sign(uint256 key, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", cards.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _pick(uint256 seed) internal view returns (bool ok, uint256 id, address holder) {
        if (tokenIds.length == 0) return (false, 0, address(0));
        id = tokenIds[seed % tokenIds.length];
        holder = cards.holderOf(id);
        ok = holder != address(0);
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }
}

/// @notice The ledger's promises, checked after every random sequence (docs/CONTRACT-V2-SPEC.md §16).
contract GachardCardsInvariantTest is StdInvariant, Test {
    GachardCards internal cards;
    CardsHandler internal handler;

    function setUp() public {
        vm.warp(1_760_000_000);
        cards = new GachardCards(address(this), makeAddr("guardian"), makeAddr("unpauser"));
        cards.registerTemplate(101, 1, 0, GachardCards.Kind.Standard, 0, 0);
        cards.registerTemplate(103, 1, 1, GachardCards.Kind.Standard, 0, 0);
        cards.registerTemplate(201, 1, 3, GachardCards.Kind.Limited, 4, 2);
        cards.registerTemplate(301, 1, 0, GachardCards.Kind.Completion, 0, 0);
        uint32[] memory live = new uint32[](4);
        live[0] = 101;
        live[1] = 103;
        live[2] = 201;
        live[3] = 301;
        cards.setTemplatesLive(live);
        cards.setLimit(cards.LIMIT_MINT(), type(uint64).max);
        cards.setLimit(cards.LIMIT_TRANSFER(), type(uint64).max);
        cards.setLimit(cards.LIMIT_BURN(), type(uint64).max);

        uint256 relayerKey = 0xA11CE;
        address relayer = vm.addr(relayerKey);
        handler = new CardsHandler(cards, relayer, relayerKey);
        cards.grantRole(cards.MINTER_ROLE(), address(handler));
        cards.grantRole(cards.STATUS_ROLE(), address(handler));
        cards.grantRole(cards.RELAYER_ROLE(), relayer);
        targetContract(address(handler));
    }

    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 80
    function invariant_limited_supply_never_exceeds_its_shares() public view {
        GachardCards.Template memory t = cards.templateInfo(201);
        assertLe(t.albumMinted, t.albumCap);
        assertLe(t.storeMinted, t.storeCap);
        assertEq(t.minted, uint256(t.albumMinted) + t.storeMinted);
    }

    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 80
    function invariant_album_locked_cards_never_move() public view {
        for (uint256 i = 0; i < handler.lockedCount(); i++) {
            uint256 id = handler.lockedIds(i);
            assertEq(cards.holderOf(id), handler.lockedHolder(id));
            assertEq(cards.balanceOf(handler.lockedHolder(id), id), 1);
        }
    }

    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 80
    function invariant_completion_cards_never_move() public view {
        for (uint256 i = 0; i < handler.completionCount(); i++) {
            uint256 id = handler.completionIds(i);
            assertEq(cards.holderOf(id), handler.completionHolder(id));
        }
    }

    /// @dev The handler never sends a card to the relayer honestly, so a card there means a forged signature worked.
    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 80
    function invariant_relayer_never_holds_a_card() public view {
        for (uint256 i = 0; i < handler.tokenCount(); i++) {
            assertTrue(cards.holderOf(handler.tokenIds(i)) != handler.relayer());
        }
    }

    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 80
    function invariant_holder_record_matches_balances() public view {
        for (uint256 i = 0; i < handler.tokenCount(); i++) {
            uint256 id = handler.tokenIds(i);
            address holder = cards.holderOf(id);
            if (holder != address(0)) assertEq(cards.balanceOf(holder, id), 1);
        }
    }
}

/// @notice Proves the handler's honest paths really work, so the invariants above are not vacuous.
contract CardsHandlerSanityTest is Test {
    function test_handler_honest_actions_succeed_and_forgeries_fail() public {
        vm.warp(1_760_000_000);
        GachardCards cards = new GachardCards(address(this), makeAddr("guardian"), makeAddr("unpauser"));
        cards.registerTemplate(101, 1, 0, GachardCards.Kind.Standard, 0, 0);
        uint32[] memory live = new uint32[](1);
        live[0] = 101;
        cards.setTemplatesLive(live);
        cards.setLimit(cards.LIMIT_MINT(), 100);
        cards.setLimit(cards.LIMIT_TRANSFER(), 100);
        cards.setLimit(cards.LIMIT_BURN(), 100);
        uint256 relayerKey = 0xA11CE;
        CardsHandler handler = new CardsHandler(cards, vm.addr(relayerKey), relayerKey);
        cards.grantRole(cards.MINTER_ROLE(), address(handler));
        cards.grantRole(cards.STATUS_ROLE(), address(handler));
        cards.grantRole(cards.RELAYER_ROLE(), vm.addr(relayerKey));

        for (uint256 i = 0; i < 4; i++) handler.mintStandard(i, false);
        handler.relayedTransfer(0, 1);
        handler.holderTransfer(1, 2);
        handler.burn(2);
        handler.lockAlbum(3);
        handler.forgedTransfer(3);
        handler.forgedTransfer(0);

        assertEq(handler.okRelayedTransfers(), 1);
        assertEq(handler.okHolderTransfers(), 1);
        assertEq(handler.okBurns(), 1);
        assertEq(handler.okLocks(), 1);
        assertTrue(cards.holderOf(handler.tokenIds(0)) != handler.relayer());
    }
}
