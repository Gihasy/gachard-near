// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./V2Base.t.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {WindowLimits} from "../../src/v2/lib/WindowLimits.sol";

contract GachardCardsTest is V2Base {
    // ═══ Minting and templates ══════════════════════════════════════════════

    function test_mint_records_holder_template_and_status() public {
        uint256 id = _mint(alice, T_COMMON);
        assertEq(cards.balanceOf(alice, id), 1);
        assertEq(cards.holderOf(id), alice);
        assertEq(cards.templateOf(id), T_COMMON);
        assertEq(uint8(cards.cardOf(id).status), uint8(GachardCards.Status.Digital));
    }

    function test_mint_rejects_unlaunched_unknown_and_completion_templates() public {
        uint32[] memory t = new uint32[](1);
        t[0] = T_DRAFT;
        vm.expectRevert(abi.encodeWithSelector(GachardCards.TemplateNotLive.selector, T_DRAFT));
        cards.mint(alice, t, GachardCards.Channel.Store);

        t[0] = 555;
        vm.expectRevert(abi.encodeWithSelector(GachardCards.UnknownTemplate.selector, uint32(555)));
        cards.mint(alice, t, GachardCards.Channel.Store);

        t[0] = T_COMPLETION;
        vm.expectRevert(abi.encodeWithSelector(GachardCards.BadTemplate.selector, T_COMPLETION));
        cards.mint(alice, t, GachardCards.Channel.Store);
    }

    function test_mint_rejects_oversized_batch() public {
        uint32[] memory t = new uint32[](26);
        for (uint256 i = 0; i < 26; i++) t[i] = T_COMMON;
        vm.expectRevert(abi.encodeWithSelector(GachardCards.BadBatch.selector, uint256(26)));
        cards.mint(alice, t, GachardCards.Channel.Store);
    }

    function test_limited_supply_is_split_by_channel_and_never_exceeded() public {
        uint32[] memory t = new uint32[](1);
        t[0] = T_LIMITED;
        cards.mint(alice, t, GachardCards.Channel.Store); // store share: 1
        vm.expectRevert(
            abi.encodeWithSelector(GachardCards.SupplyExhausted.selector, T_LIMITED, GachardCards.Channel.Store)
        );
        cards.mint(alice, t, GachardCards.Channel.Store);

        cards.mint(alice, t, GachardCards.Channel.Album);
        cards.mint(bob, t, GachardCards.Channel.Album); // album share: 2
        vm.expectRevert(
            abi.encodeWithSelector(GachardCards.SupplyExhausted.selector, T_LIMITED, GachardCards.Channel.Album)
        );
        cards.mint(carol, t, GachardCards.Channel.Album);
        assertEq(cards.templateInfo(T_LIMITED).minted, 3);
    }

    function test_live_templates_are_frozen() public {
        vm.expectRevert(abi.encodeWithSelector(GachardCards.TemplateIsLive.selector, T_LIMITED));
        cards.registerTemplate(T_LIMITED, SERIES, 3, GachardCards.Kind.Limited, 2000, 1000);
    }

    function test_module_roles_cannot_go_to_a_persons_key() public {
        bytes32 minter = cards.MINTER_ROLE();
        vm.expectRevert(abi.encodeWithSelector(GachardCards.ModuleRoleNeedsContract.selector, minter, alice));
        cards.grantRole(minter, alice);
    }

    function test_only_minters_mint() public {
        uint32[] memory t = new uint32[](1);
        t[0] = T_COMMON;
        bytes32 minter = cards.MINTER_ROLE();
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, minter)
        );
        cards.mint(alice, t, GachardCards.Channel.Store);
    }

    // ═══ Holder-signed transfers ════════════════════════════════════════════

    function test_transferWithSig_moves_a_card_with_the_holders_signature() public {
        uint256 id = _mint(alice, T_COMMON);
        uint256 deadline = _deadline();
        bytes memory sig = _transferSig(ALICE_KEY, alice, bob, _ids(id), 1, deadline);

        vm.prank(relayer);
        cards.transferWithSig(alice, bob, _ids(id), 1, deadline, sig);
        assertEq(cards.holderOf(id), bob);
        assertEq(cards.balanceOf(bob, id), 1);
    }

    function test_relayer_cannot_move_a_card_without_the_holder() public {
        uint256 id = _mint(alice, T_COMMON);
        uint256 deadline = _deadline();
        // Signed by the relayer itself, not by Alice: the v1 marketplaceTransfer hole.
        bytes memory sig = _transferSig(RELAYER_KEY, alice, relayer, _ids(id), 1, deadline);

        vm.prank(relayer);
        vm.expectRevert(GachardCards.BadSignature.selector);
        cards.transferWithSig(alice, relayer, _ids(id), 1, deadline, sig);
    }

    function test_signature_cannot_be_redirected_to_another_recipient() public {
        uint256 id = _mint(alice, T_COMMON);
        uint256 deadline = _deadline();
        bytes memory sig = _transferSig(ALICE_KEY, alice, bob, _ids(id), 1, deadline);

        vm.prank(relayer);
        vm.expectRevert(GachardCards.BadSignature.selector);
        cards.transferWithSig(alice, carol, _ids(id), 1, deadline, sig);
    }

    function test_nonce_cannot_be_replayed() public {
        uint256 a = _mint(alice, T_COMMON);
        uint256 deadline = _deadline();
        bytes memory sig = _transferSig(ALICE_KEY, alice, bob, _ids(a), 7, deadline);
        vm.prank(relayer);
        cards.transferWithSig(alice, bob, _ids(a), 7, deadline, sig);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardCards.NonceAlreadyUsed.selector, alice, uint256(7)));
        cards.transferWithSig(alice, bob, _ids(a), 7, deadline, sig);
    }

    function test_deadlines_are_enforced_both_ways() public {
        uint256 id = _mint(alice, T_COMMON);

        uint256 late = block.timestamp - 1;
        bytes memory sig = _transferSig(ALICE_KEY, alice, bob, _ids(id), 1, late);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardCards.SignatureExpired.selector, late));
        cards.transferWithSig(alice, bob, _ids(id), 1, late, sig);

        uint256 far = block.timestamp + 2 hours;
        sig = _transferSig(ALICE_KEY, alice, bob, _ids(id), 2, far);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardCards.DeadlineTooFar.selector, far));
        cards.transferWithSig(alice, bob, _ids(id), 2, far, sig);
    }

    function test_only_relayers_submit_signed_actions() public {
        uint256 id = _mint(alice, T_COMMON);
        uint256 deadline = _deadline();
        bytes memory sig = _transferSig(ALICE_KEY, alice, bob, _ids(id), 1, deadline);
        bytes32 role = cards.RELAYER_ROLE();
        // A phished signature is useless outside Gachard's relayer.
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, bob, role));
        cards.transferWithSig(alice, bob, _ids(id), 1, deadline, sig);
    }

    /// @dev Privy's sponsored wallets carry EIP-7702 code (ADR-031). OpenZeppelin's checker
    ///      rejects their plain signatures; SigCheck accepts them.
    function test_eip7702_wallet_signature_is_accepted() public {
        uint256 id = _mint(alice, T_COMMON);
        vm.etch(alice, abi.encodePacked(hex"ef0100", address(0xdead)));
        assertGt(alice.code.length, 0);

        uint256 deadline = _deadline();
        bytes memory sig = _transferSig(ALICE_KEY, alice, bob, _ids(id), 1, deadline);
        bytes32 structHash = keccak256(
            abi.encode(cards.TRANSFER_TYPEHASH(), alice, bob, keccak256(abi.encodePacked(_ids(id))), uint256(1), deadline)
        );
        bytes32 digest = _digest(cards.domainSeparator(), structHash);
        assertFalse(SignatureChecker.isValidSignatureNow(alice, digest, sig), "OpenZeppelin default rejects it");

        vm.prank(relayer);
        cards.transferWithSig(alice, bob, _ids(id), 1, deadline, sig);
        assertEq(cards.holderOf(id), bob);
    }

    function test_erc1271_contract_wallet_signature_is_accepted() public {
        MockSmartWallet wallet = new MockSmartWallet(alice);
        uint256 id = _mint(address(wallet), T_COMMON);
        uint256 deadline = _deadline();
        bytes memory sig = _transferSig(ALICE_KEY, address(wallet), bob, _ids(id), 1, deadline);

        vm.prank(relayer);
        cards.transferWithSig(address(wallet), bob, _ids(id), 1, deadline, sig);
        assertEq(cards.holderOf(id), bob);
    }

    // ═══ Rules every path obeys ═════════════════════════════════════════════

    /// @dev v1 accepted a zero-value transfer of anyone's card and still rewrote lastOwner.
    function test_zero_value_transfer_is_rejected_and_holder_unchanged() public {
        uint256 id = _mint(alice, T_COMMON);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GachardCards.InvalidAmount.selector, id, uint256(0)));
        cards.safeTransferFrom(bob, carol, id, 0, "");
        assertEq(cards.holderOf(id), alice);
    }

    function test_holder_can_transfer_own_card_even_while_paused() public {
        uint256 id = _mint(alice, T_COMMON);
        vm.prank(guardian);
        cards.pause();

        vm.prank(alice);
        cards.safeTransferFrom(alice, bob, id, 1, "");
        assertEq(cards.holderOf(id), bob);
    }

    function test_privileged_paths_stop_while_paused() public {
        vm.prank(guardian);
        cards.pause();
        uint32[] memory t = new uint32[](1);
        t[0] = T_COMMON;
        vm.expectRevert(Pausable.EnforcedPause.selector);
        cards.mint(alice, t, GachardCards.Channel.Store);
    }

    function test_completion_card_is_soulbound() public {
        uint256 id = cards.mintCompletion(alice, T_COMPLETION, 1);
        assertEq(cards.cardOf(id).serial, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GachardCards.Soulbound.selector, id));
        cards.safeTransferFrom(alice, bob, id, 1, "");
    }

    function test_album_locked_card_never_moves_or_burns() public {
        uint256 id = _mint(alice, T_COMMON);
        cards.lockForAlbum(alice, _ids(id));

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(GachardCards.WrongStatus.selector, id, GachardCards.Status.AlbumLocked)
        );
        cards.safeTransferFrom(alice, bob, id, 1, "");

        uint256 deadline = _deadline();
        bytes memory sig = _burnSig(ALICE_KEY, alice, _ids(id), 1, deadline);
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(GachardCards.WrongStatus.selector, id, GachardCards.Status.AlbumLocked)
        );
        cards.burnWithSig(alice, _ids(id), 1, deadline, sig);
    }

    function test_limited_cards_cannot_be_locked_into_albums() public {
        uint32[] memory t = new uint32[](1);
        t[0] = T_LIMITED;
        uint256 id = cards.mint(alice, t, GachardCards.Channel.Album);
        vm.expectRevert(abi.encodeWithSelector(GachardCards.WrongKind.selector, id));
        cards.lockForAlbum(alice, _ids(id));
    }

    // ═══ Burn ═══════════════════════════════════════════════════════════════

    function test_burnWithSig_dismantles_standard_cards() public {
        uint256 a = _mint(alice, T_COMMON);
        uint256 b = _mint(alice, T_RARE);
        uint256 deadline = _deadline();
        bytes memory sig = _burnSig(ALICE_KEY, alice, _ids(a, b), 1, deadline);

        vm.prank(relayer);
        cards.burnWithSig(alice, _ids(a, b), 1, deadline, sig);
        assertEq(cards.balanceOf(alice, a), 0);
        assertEq(cards.holderOf(b), address(0));
    }

    function test_limited_cards_are_never_burned() public {
        uint32[] memory t = new uint32[](1);
        t[0] = T_LIMITED;
        uint256 id = cards.mint(alice, t, GachardCards.Channel.Album);
        uint256 deadline = _deadline();
        bytes memory sig = _burnSig(ALICE_KEY, alice, _ids(id), 1, deadline);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardCards.NotBurnable.selector, id));
        cards.burnWithSig(alice, _ids(id), 1, deadline, sig);
    }

    // ═══ Print and redeem ═══════════════════════════════════════════════════

    function _print(uint256 id, bytes memory code, uint256 nonce) internal {
        uint32 nextCycle = cards.cardOf(id).printCycle + 1;
        bytes32 commit = _commit(id, nextCycle, code);
        uint256 deadline = _deadline();
        bytes memory sig = _printSig(ALICE_KEY, alice, id, commit, nonce, deadline);
        vm.prank(relayer);
        cards.requestPrintWithSig(alice, id, commit, nonce, deadline, sig);
    }

    function test_print_locks_in_place_and_redeem_moves_to_whoever_has_the_code() public {
        uint256 id = _mint(alice, T_RARE);
        bytes memory code = "K7Q29XMP4RTWH8NC";
        _print(id, code, 1);

        assertEq(cards.holderOf(id), alice, "locked in place, not moved (ADR-004 amendment)");
        assertEq(uint8(cards.cardOf(id).status), uint8(GachardCards.Status.PrintLocked));
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(GachardCards.WrongStatus.selector, id, GachardCards.Status.PrintLocked)
        );
        cards.safeTransferFrom(alice, bob, id, 1, "");

        vm.prank(relayer);
        cards.redeem(id, code, bob);
        assertEq(cards.holderOf(id), bob);
        assertEq(uint8(cards.cardOf(id).status), uint8(GachardCards.Status.Digital));
        assertEq(cards.printCommitOf(id), bytes32(0));
    }

    function test_redeem_checks_the_code_not_a_public_hash() public {
        uint256 id = _mint(alice, T_RARE);
        _print(id, "RIGHT-CODE", 1);
        bytes32 publicCommit = cards.printCommitOf(id);

        vm.startPrank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardCards.BadRedeemCode.selector, id));
        cards.redeem(id, abi.encodePacked(publicCommit), relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardCards.BadRedeemCode.selector, id));
        cards.redeem(id, "WRONG-CODE", relayer);
        vm.stopPrank();
    }

    function test_reprint_retires_the_old_code() public {
        uint256 id = _mint(alice, T_RARE);
        _print(id, "FIRST", 1);
        vm.prank(relayer);
        cards.redeem(id, "FIRST", alice);

        _print(id, "SECOND", 2);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardCards.BadRedeemCode.selector, id));
        cards.redeem(id, "FIRST", bob);
    }

    function test_cancel_print_returns_to_digital() public {
        uint256 id = _mint(alice, T_RARE);
        _print(id, "CODE", 1);
        uint256 deadline = _deadline();
        bytes memory sig = _cancelSig(ALICE_KEY, alice, id, 2, deadline);
        vm.prank(relayer);
        cards.cancelPrintWithSig(alice, id, 2, deadline, sig);
        assertEq(uint8(cards.cardOf(id).status), uint8(GachardCards.Status.Digital));
    }

    // ═══ Limits, guardian and admin ═════════════════════════════════════════

    function test_limit_binds_within_a_window_and_resets_after_it() public {
        cards.setLimit(cards.LIMIT_TRANSFER(), 1);
        uint256 a = _mint(alice, T_COMMON);
        uint256 b = _mint(alice, T_COMMON);
        uint256 deadline = _deadline();

        bytes memory sig = _transferSig(ALICE_KEY, alice, bob, _ids(a), 1, deadline);
        vm.prank(relayer);
        cards.transferWithSig(alice, bob, _ids(a), 1, deadline, sig);

        sig = _transferSig(ALICE_KEY, alice, bob, _ids(b), 2, deadline);
        bytes32 action = cards.LIMIT_TRANSFER();
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(WindowLimits.LimitExceeded.selector, action, relayer, uint256(1), uint256(0))
        );
        cards.transferWithSig(alice, bob, _ids(b), 2, deadline, sig);

        vm.warp(block.timestamp + 1 hours);
        deadline = _deadline();
        sig = _transferSig(ALICE_KEY, alice, bob, _ids(b), 3, deadline);
        vm.prank(relayer);
        cards.transferWithSig(alice, bob, _ids(b), 3, deadline, sig);
        assertEq(cards.holderOf(b), bob);
    }

    function test_an_unconfigured_limit_refuses_rather_than_allows() public {
        GachardCards fresh = new GachardCards(address(this), guardian, unpauser);
        fresh.registerTemplate(T_COMMON, SERIES, 0, GachardCards.Kind.Standard, 0, 0);
        uint32[] memory t = new uint32[](1);
        t[0] = T_COMMON;
        fresh.setTemplatesLive(t);
        fresh.grantRole(fresh.MINTER_ROLE(), address(this));
        vm.expectRevert();
        fresh.mint(alice, t, GachardCards.Channel.Store);
    }

    function test_guardian_lowers_but_never_raises_limits() public {
        bytes32 action = cards.LIMIT_BURN();
        vm.startPrank(guardian);
        cards.lowerLimit(action, 10);
        vm.expectRevert(abi.encodeWithSelector(WindowLimits.LimitNotLower.selector, action, uint64(10), uint64(50)));
        cards.lowerLimit(action, 50);
        vm.stopPrank();
        assertEq(cards.limitOf(action), 10);
    }

    function test_guardian_revokes_hot_roles_but_not_admin() public {
        bytes32 relayerRole = cards.RELAYER_ROLE();
        bytes32 adminRole = cards.DEFAULT_ADMIN_ROLE();
        vm.startPrank(guardian);
        cards.emergencyRevoke(relayerRole, relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardCards.NotOperationalRole.selector, adminRole));
        cards.emergencyRevoke(adminRole, address(this));
        vm.stopPrank();
        assertFalse(cards.hasRole(relayerRole, relayer));
    }

    function test_guardian_pauses_only_the_unpauser_unpauses() public {
        vm.prank(guardian);
        cards.pause();
        bytes32 unpauserRole = cards.UNPAUSER_ROLE();
        vm.prank(guardian);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, guardian, unpauserRole)
        );
        cards.unpause();
        vm.prank(unpauser);
        cards.unpause();
        assertFalse(cards.paused());
    }

    function test_uri_is_empty_until_admin_sets_it() public {
        assertEq(cards.uri(1), "");
        cards.setURI("https://example.invalid/{id}.json");
        assertEq(cards.uri(1), "https://example.invalid/{id}.json");
    }

    function test_royalty_is_zero_until_set() public view {
        (address receiver, uint256 amount) = cards.royaltyInfo(1, 10_000);
        assertEq(receiver, address(0));
        assertEq(amount, 0);
    }

    function test_roles_are_enumerable() public view {
        assertEq(cards.getRoleMemberCount(cards.RELAYER_ROLE()), 1);
        assertEq(cards.getRoleMember(cards.RELAYER_ROLE(), 0), relayer);
    }
}
