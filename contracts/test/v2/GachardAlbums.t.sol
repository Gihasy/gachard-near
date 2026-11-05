// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./V2Base.t.sol";
import {GachardAlbums} from "../../src/v2/GachardAlbums.sol";

/// @notice A contract wallet that tries to move a card away while it is being minted to it.
contract SlipperyWallet is MockSmartWallet {
    GachardCards internal immutable cards;
    address internal immutable sink;

    constructor(address owner_, GachardCards cards_, address sink_) MockSmartWallet(owner_) {
        cards = cards_;
        sink = sink_;
    }

    function onERC1155Received(address, address, uint256 id, uint256, bytes memory)
        public
        override
        returns (bytes4)
    {
        cards.safeTransferFrom(address(this), sink, id, 1, "");
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] memory ids, uint256[] memory, bytes memory)
        public
        override
        returns (bytes4)
    {
        for (uint256 i = 0; i < ids.length; i++) cards.safeTransferFrom(address(this), sink, ids[i], 1, "");
        return this.onERC1155BatchReceived.selector;
    }
}

contract GachardAlbumsTest is V2Base {
    GachardAlbums internal albums;
    uint256 internal constant SEASON = 1;

    function setUp() public override {
        super.setUp();
        albums = new GachardAlbums(cards, address(this), guardian, unpauser);
        cards.grantRole(cards.MINTER_ROLE(), address(albums));
        cards.grantRole(cards.STATUS_ROLE(), address(albums));
        albums.grantRole(albums.RELAYER_ROLE(), relayer);
        albums.setLimit(albums.LIMIT_WISH(), 1_000);
        albums.setLimit(albums.LIMIT_REWARD(), 1_000);

        uint32[] memory slots = new uint32[](3);
        slots[0] = T_COMMON;
        slots[1] = T_COMMON_2;
        slots[2] = T_RARE;
        albums.registerSeason(
            SEASON, SERIES, T_LIMITED, T_COMPLETION, uint40(block.timestamp), uint40(block.timestamp + 90 days), slots
        );
    }

    // ─── Signing helpers ────────────────────────────────────────────────────

    function _placeSig(uint256 key, address holder, uint256[] memory ids, uint16[] memory slots, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                albums.PLACE_TYPEHASH(),
                holder,
                SEASON,
                keccak256(abi.encodePacked(ids)),
                keccak256(abi.encodePacked(slots)),
                nonce,
                deadline
            )
        );
        return _sign(key, _digest(albums.domainSeparator(), structHash));
    }

    function _wishHash(address holder, uint16 slot, uint256 nonce, uint256 deadline) internal view returns (bytes32) {
        return _digest(
            albums.domainSeparator(), keccak256(abi.encode(albums.WISH_TYPEHASH(), holder, SEASON, slot, nonce, deadline))
        );
    }

    function _rewardHash(address holder, uint256 deadline) internal view returns (bytes32) {
        return _digest(albums.domainSeparator(), keccak256(abi.encode(albums.REWARD_TYPEHASH(), holder, SEASON, deadline)));
    }

    function _slots(uint16 a, uint16 b) internal pure returns (uint16[] memory s) {
        s = new uint16[](2);
        s[0] = a;
        s[1] = b;
    }

    /// @dev Fills slots 0 and 1 by placement and slot 2 by Wish Card.
    function _complete(address holder, uint256 key) internal {
        uint256 a = _mint(holder, T_COMMON);
        uint256 b = _mint(holder, T_COMMON_2);
        uint256 deadline = _deadline();
        bytes memory sig = _placeSig(key, holder, _ids(a, b), _slots(0, 1), 1, deadline);
        vm.prank(relayer);
        albums.placeInAlbum(holder, SEASON, _ids(a, b), _slots(0, 1), 1, deadline, sig);

        bytes memory wishSig = _sign(key, _wishHash(holder, 2, 2, deadline));
        vm.prank(relayer);
        albums.wishIntoAlbum(holder, SEASON, 2, 2, deadline, wishSig, "");
    }

    // ─── Tests ──────────────────────────────────────────────────────────────

    function test_placing_locks_cards_for_good() public {
        uint256 a = _mint(alice, T_COMMON);
        uint256 b = _mint(alice, T_COMMON_2);
        uint256 deadline = _deadline();
        bytes memory sig = _placeSig(ALICE_KEY, alice, _ids(a, b), _slots(0, 1), 1, deadline);
        vm.prank(relayer);
        albums.placeInAlbum(alice, SEASON, _ids(a, b), _slots(0, 1), 1, deadline, sig);

        assertEq(albums.filledCount(SEASON, alice), 2);
        assertEq(uint8(cards.cardOf(a).status), uint8(GachardCards.Status.AlbumLocked));
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(GachardCards.WrongStatus.selector, a, GachardCards.Status.AlbumLocked)
        );
        cards.safeTransferFrom(alice, bob, a, 1, "");
    }

    function test_a_card_only_fits_its_own_slot() public {
        uint256 a = _mint(alice, T_COMMON);
        uint256 deadline = _deadline();
        uint16[] memory slot = new uint16[](1);
        slot[0] = 2; // the Rare slot
        bytes memory sig = _placeSig(ALICE_KEY, alice, _ids(a), slot, 1, deadline);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardAlbums.WrongTemplateForSlot.selector, a, uint16(2)));
        albums.placeInAlbum(alice, SEASON, _ids(a), slot, 1, deadline, sig);
    }

    function test_relayer_cannot_place_someone_elses_cards() public {
        uint256 a = _mint(alice, T_COMMON);
        uint256 deadline = _deadline();
        uint16[] memory slot = new uint16[](1);
        slot[0] = 0;
        bytes memory sig = _placeSig(RELAYER_KEY, alice, _ids(a), slot, 1, deadline);
        vm.prank(relayer);
        vm.expectRevert(GachardAlbums.BadSignature.selector);
        albums.placeInAlbum(alice, SEASON, _ids(a), slot, 1, deadline, sig);
    }

    function test_wish_card_lands_locked_and_never_in_the_collection() public {
        uint256 deadline = _deadline();
        bytes memory sig = _sign(ALICE_KEY, _wishHash(alice, 2, 9, deadline));
        vm.prank(relayer);
        uint256 id = albums.wishIntoAlbum(alice, SEASON, 2, 9, deadline, sig, "");

        assertEq(cards.templateOf(id), T_RARE);
        assertEq(uint8(cards.cardOf(id).status), uint8(GachardCards.Status.AlbumLocked));
        assertEq(albums.slotToken(SEASON, alice, 2), id);
    }

    function test_rewards_need_a_complete_album() public {
        uint256 a = _mint(alice, T_COMMON);
        uint256 deadline = _deadline();
        uint16[] memory slot = new uint16[](1);
        slot[0] = 0;
        bytes memory sig = _placeSig(ALICE_KEY, alice, _ids(a), slot, 1, deadline);
        vm.prank(relayer);
        albums.placeInAlbum(alice, SEASON, _ids(a), slot, 1, deadline, sig);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardAlbums.AlbumIncomplete.selector, uint16(1), uint16(3)));
        albums.claimRewards(alice, SEASON, _deadline(), "");
    }

    function test_first_completers_get_the_limited_card_then_completion_only() public {
        _complete(alice, ALICE_KEY);
        _complete(bob, BOB_KEY);
        _complete(carol, CAROL_KEY);

        vm.startPrank(relayer);
        (uint256 c1, uint256 l1) = albums.claimRewards(alice, SEASON, _deadline(), "");
        (uint256 c2, uint256 l2) = albums.claimRewards(bob, SEASON, _deadline(), "");
        (uint256 c3, uint256 l3) = albums.claimRewards(carol, SEASON, _deadline(), "");
        vm.stopPrank();

        assertEq(cards.cardOf(c1).serial, 1);
        assertEq(cards.cardOf(c2).serial, 2);
        assertEq(cards.cardOf(c3).serial, 3);
        assertGt(l1, 0);
        assertGt(l2, 0);
        assertEq(l3, 0, "album share of 2 is gone: Completion card only, no reservation");
        assertEq(cards.templateOf(l1), T_LIMITED);
    }

    function test_rewards_are_claimed_once_per_address() public {
        _complete(alice, ALICE_KEY);
        vm.startPrank(relayer);
        albums.claimRewards(alice, SEASON, _deadline(), "");
        vm.expectRevert(abi.encodeWithSelector(GachardAlbums.AlreadyClaimed.selector, SEASON, alice));
        albums.claimRewards(alice, SEASON, _deadline(), "");
        vm.stopPrank();
    }

    function test_attestor_must_cosign_wishes_and_rewards_when_set() public {
        albums.setAttestor(attestorAddr);
        uint256 deadline = _deadline();
        bytes32 wishDigest = _wishHash(alice, 2, 9, deadline);
        bytes memory holderSig = _sign(ALICE_KEY, wishDigest);

        vm.prank(relayer);
        vm.expectRevert(GachardAlbums.BadAttestation.selector);
        albums.wishIntoAlbum(alice, SEASON, 2, 9, deadline, holderSig, holderSig);

        vm.prank(relayer);
        albums.wishIntoAlbum(alice, SEASON, 2, 9, deadline, holderSig, _sign(ATTESTOR_KEY, wishDigest));
        assertEq(albums.filledCount(SEASON, alice), 1);
    }

    function test_season_rules_outside_its_dates() public {
        vm.warp(block.timestamp + 91 days);
        uint256 deadline = _deadline();
        bytes memory sig = _sign(ALICE_KEY, _wishHash(alice, 2, 1, deadline));
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardAlbums.SeasonNotActive.selector, SEASON));
        albums.wishIntoAlbum(alice, SEASON, 2, 1, deadline, sig, "");
    }

    /// @dev Slither flagged the mint-then-lock order. A holder that moves the card away
    ///      inside its receiver hook must undo the whole Wish, leaving no trace.
    function test_wish_is_undone_if_the_card_is_moved_during_the_mint() public {
        SlipperyWallet wallet = new SlipperyWallet(alice, cards, bob);
        address holder = address(wallet);
        uint256 deadline = _deadline();
        bytes memory sig = _sign(ALICE_KEY, _wishHash(holder, 2, 1, deadline));

        vm.prank(relayer);
        vm.expectRevert();
        albums.wishIntoAlbum(holder, SEASON, 2, 1, deadline, sig, "");

        assertEq(albums.slotToken(SEASON, holder, 2), 0);
        assertEq(albums.filledCount(SEASON, holder), 0);
        assertFalse(albums.nonceUsed(holder, 1));
    }

    function test_season_slots_must_be_standard_cards_of_the_series() public {
        uint32[] memory slots = new uint32[](1);
        slots[0] = T_LIMITED; // a Wish Card must never be able to pick a limited card
        vm.expectRevert(abi.encodeWithSelector(GachardAlbums.BadSlotTemplate.selector, uint256(2), uint16(0)));
        albums.registerSeason(
            2, SERIES, T_LIMITED, T_COMPLETION, uint40(block.timestamp), uint40(block.timestamp + 1 days), slots
        );
    }
}
