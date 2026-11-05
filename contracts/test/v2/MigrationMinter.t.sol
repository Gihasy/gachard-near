// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./V2Base.t.sol";
import {GachardCard} from "../../src/GachardCard.sol";
import {MigrationMinter, IGachardCardV1} from "../../src/v2/MigrationMinter.sol";

contract MigrationMinterTest is V2Base {
    GachardCard internal v1;
    MigrationMinter internal migrator;
    address internal dave = makeAddr("dave");

    // Snapshot: v1 tokens 1–4.
    //   1 Digital, alice → T_COMMON
    //   2 Digital, bob   → T_COMMON_2
    //   3 Vaulted, carol → T_RARE (a physical card in circulation)
    //   4 Digital, alice → T_COMMON (moves to bob after the snapshot)
    bytes32[4] internal leaves;
    bytes32 internal n01;
    bytes32 internal n23;

    function setUp() public override {
        super.setUp();
        v1 = new GachardCard(); // the test contract is the v1 owner
        v1.mintCard(alice, 0);
        v1.mintCard(bob, 0);
        v1.mintCard(carol, 1);
        v1.mintCard(alice, 0);
        v1.requestPrint(3, keccak256("v1-code"), carol);

        leaves[0] = _leaf(1, alice, T_COMMON, 0);
        leaves[1] = _leaf(2, bob, T_COMMON_2, 0);
        leaves[2] = _leaf(3, carol, T_RARE, 1);
        leaves[3] = _leaf(4, alice, T_COMMON, 0);
        n01 = _pair(leaves[0], leaves[1]);
        n23 = _pair(leaves[2], leaves[3]);

        migrator = new MigrationMinter(cards, IGachardCardV1(address(v1)), _pair(n01, n23), address(this), guardian);
        cards.grantRole(cards.MINTER_ROLE(), address(migrator));
        migrator.grantRole(migrator.RELAYER_ROLE(), relayer);

        v1.marketplaceTransfer(4, alice, bob); // after the snapshot
    }

    function _leaf(uint256 id, address holder, uint32 templateId, uint8 kind) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(id, holder, templateId, kind))));
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _proof(uint256 i) internal view returns (bytes32[] memory p) {
        p = new bytes32[](2);
        if (i == 0) (p[0], p[1]) = (leaves[1], n23);
        if (i == 1) (p[0], p[1]) = (leaves[0], n23);
        if (i == 2) (p[0], p[1]) = (leaves[3], n01);
        if (i == 3) (p[0], p[1]) = (leaves[2], n01);
    }

    function _entry(uint256 i, uint256 id, address holder, uint32 t, uint8 kind)
        internal
        view
        returns (MigrationMinter.Entry memory)
    {
        return MigrationMinter.Entry({v1TokenId: id, holder: holder, templateId: t, kind: kind, proof: _proof(i)});
    }

    function _one(MigrationMinter.Entry memory e) internal pure returns (MigrationMinter.Entry[] memory list) {
        list = new MigrationMinter.Entry[](1);
        list[0] = e;
    }

    function test_leaf_encoding_matches_the_contract() public view {
        assertEq(migrator.leafOf(1, alice, T_COMMON, 0), leaves[0]);
    }

    function test_digital_cards_are_minted_to_their_holders() public {
        MigrationMinter.Entry[] memory batch = new MigrationMinter.Entry[](2);
        batch[0] = _entry(0, 1, alice, T_COMMON, 0);
        batch[1] = _entry(1, 2, bob, T_COMMON_2, 0);
        vm.prank(relayer);
        migrator.migrate(batch);

        uint256 a = migrator.migratedTo(1);
        uint256 b = migrator.migratedTo(2);
        assertEq(cards.holderOf(a), alice);
        assertEq(cards.templateOf(a), T_COMMON);
        assertEq(cards.holderOf(b), bob);
    }

    function test_a_card_migrates_once() public {
        vm.startPrank(relayer);
        migrator.migrate(_one(_entry(0, 1, alice, T_COMMON, 0)));
        vm.expectRevert(abi.encodeWithSelector(MigrationMinter.AlreadyMigrated.selector, uint256(1)));
        migrator.migrate(_one(_entry(0, 1, alice, T_COMMON, 0)));
        vm.stopPrank();
    }

    function test_a_tampered_entry_fails_its_proof() public {
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(MigrationMinter.BadProof.selector, uint256(1)));
        migrator.migrate(_one(_entry(0, 1, relayer, T_COMMON, 0)));
    }

    function test_a_card_that_moved_after_the_snapshot_is_not_minted_to_its_old_holder() public {
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(MigrationMinter.NotHeldOnV1.selector, uint256(4), alice));
        migrator.migrate(_one(_entry(3, 4, alice, T_COMMON, 0)));
    }

    function test_a_v1_physical_card_migrates_only_after_it_is_redeemed_on_v1() public {
        MigrationMinter.Entry memory e = _entry(2, 3, carol, T_RARE, 1);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(MigrationMinter.WrongKind.selector, uint256(3), uint8(1)));
        migrator.migrate(_one(e));

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(MigrationMinter.StillPrintedOnV1.selector, uint256(3)));
        migrator.migrateRedeemed(e, dave);

        // Dave holds the physical card and redeems it on v1, as today.
        v1.redeemCard(3, keccak256("v1-code"), dave);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(MigrationMinter.NotHeldOnV1.selector, uint256(3), carol));
        migrator.migrateRedeemed(e, carol);

        vm.prank(relayer);
        migrator.migrateRedeemed(e, dave);
        assertEq(cards.holderOf(migrator.migratedTo(3)), dave);
    }

    /// @dev The preferred path: the card in someone's hand keeps its v1 code. The code is
    ///      base64url, as v1 issued it (frontend/lib/redeem-code.ts), and the ledger checks
    ///      whatever bytes it was committed with.
    function test_a_printed_card_moves_as_printed_and_its_v1_code_still_redeems() public {
        bytes memory v1Code = "aB3-_xYzQ9kL0p2W";
        vm.prank(relayer);
        migrator.migratePrinted(_one(_entry(2, 3, carol, T_RARE, 1)));
        uint256 id = migrator.migratedTo(3);
        assertEq(cards.holderOf(id), carol);

        // The backend locks it again under the same, decrypted code, signed as the custodial holder.
        bytes32 commit = _commit(id, 1, v1Code);
        uint256 deadline = _deadline();
        bytes memory sig = _printSig(CAROL_KEY, carol, id, commit, 1, deadline);
        vm.prank(relayer);
        cards.requestPrintWithSig(carol, id, commit, 1, deadline, sig);

        vm.prank(relayer);
        cards.redeem(id, v1Code, dave);
        assertEq(cards.holderOf(id), dave);
    }

    function test_migratePrinted_refuses_a_card_already_redeemed_on_v1() public {
        v1.redeemCard(3, keccak256("v1-code"), dave);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(MigrationMinter.NotPrintedOnV1.selector, uint256(3)));
        migrator.migratePrinted(_one(_entry(2, 3, carol, T_RARE, 1)));
    }

    function test_the_two_printed_paths_cannot_both_mint() public {
        vm.prank(relayer);
        migrator.migratePrinted(_one(_entry(2, 3, carol, T_RARE, 1)));
        v1.redeemCard(3, keccak256("v1-code"), dave);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(MigrationMinter.AlreadyMigrated.selector, uint256(3)));
        migrator.migrateRedeemed(_entry(2, 3, carol, T_RARE, 1), dave);
    }

    function test_retire_gives_up_minting_for_good() public {
        bytes32 minter = cards.MINTER_ROLE();
        vm.prank(guardian);
        migrator.retire();
        assertFalse(cards.hasRole(minter, address(migrator)));

        vm.prank(relayer);
        vm.expectRevert(MigrationMinter.IsRetired.selector);
        migrator.migrate(_one(_entry(0, 1, alice, T_COMMON, 0)));
    }

    function test_only_relayers_migrate_and_only_admin_or_guardian_retire() public {
        vm.prank(alice);
        vm.expectRevert();
        migrator.migrate(_one(_entry(0, 1, alice, T_COMMON, 0)));

        vm.prank(relayer);
        vm.expectRevert();
        migrator.retire();
    }
}
