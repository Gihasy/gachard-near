// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./V2Base.t.sol";
import {GachardStore} from "../../src/v2/GachardStore.sol";
import {MockEntropy} from "@pythnetwork/entropy-sdk-solidity/MockEntropy.sol";
import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";

contract GachardStoreTest is V2Base {
    GachardStore internal store;
    MockEntropy internal mockEntropy;
    address internal provider = address(0xAAAA);

    bytes32 internal constant SECRET = keccak256("rotation-7-server-secret");
    uint256 internal constant ROTATION = 7;

    function setUp() public override {
        super.setUp();
        mockEntropy = new MockEntropy(provider);
        store = new GachardStore(address(mockEntropy), cards, address(this), guardian, unpauser);
        cards.grantRole(cards.MINTER_ROLE(), address(store));
        store.grantRole(store.RELAYER_ROLE(), relayer);
        store.setLimit(store.LIMIT_PURCHASE_CARDS(), 1_000);
        vm.deal(address(store), 1 ether);
    }

    function _openRotation() internal returns (uint64 seq) {
        vm.startPrank(relayer);
        store.commitRotation(
            ROTATION,
            keccak256(abi.encode(SECRET)),
            uint40(block.timestamp + 6 hours),
            uint40(block.timestamp + 30 hours)
        );
        seq = store.requestRotationEntropy(ROTATION);
        vm.stopPrank();
        mockEntropy.mockReveal(provider, seq, keccak256("pyth-seed"));
    }

    function _templates() internal pure returns (uint32[] memory t) {
        t = new uint32[](3);
        t[0] = T_COMMON;
        t[1] = T_RARE;
        t[2] = T_COMMON_2;
    }

    function _attest(bytes32 purchaseId, address buyer, uint32[] memory t, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(store.PURCHASE_TYPEHASH(), purchaseId, buyer, ROTATION, keccak256(abi.encodePacked(t)), deadline)
        );
        return _sign(ATTESTOR_KEY, _digest(store.domainSeparator(), structHash));
    }

    function test_full_rotation_commit_seed_purchase_reveal() public {
        _openRotation();
        assertEq(store.rotation(ROTATION).seed, keccak256("pyth-seed"));

        vm.prank(relayer);
        uint256 first = store.purchase(bytes32("p1"), alice, ROTATION, _templates(), _deadline(), "");
        assertEq(cards.holderOf(first), alice);
        assertEq(cards.templateOf(first + 1), T_RARE);
        assertTrue(store.purchaseHashOf(bytes32("p1")) != bytes32(0));

        vm.warp(block.timestamp + 30 hours);
        vm.prank(relayer);
        store.revealRotation(ROTATION, SECRET);
        assertEq(store.rotation(ROTATION).secret, SECRET);
    }

    function test_no_purchase_before_the_store_is_fixed() public {
        vm.prank(relayer);
        store.commitRotation(
            ROTATION, keccak256(abi.encode(SECRET)), uint40(block.timestamp + 6 hours), uint40(block.timestamp + 30 hours)
        );
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardStore.StoreNotReady.selector, ROTATION));
        store.purchase(bytes32("p1"), alice, ROTATION, _templates(), _deadline(), "");
    }

    function test_a_retried_purchase_reverts_instead_of_minting_twice() public {
        _openRotation();
        vm.startPrank(relayer);
        store.purchase(bytes32("p1"), alice, ROTATION, _templates(), _deadline(), "");
        vm.expectRevert(abi.encodeWithSelector(GachardStore.PurchaseAlreadyRecorded.selector, bytes32("p1")));
        store.purchase(bytes32("p1"), alice, ROTATION, _templates(), _deadline(), "");
        vm.stopPrank();
    }

    function test_reveal_waits_for_the_reserve_window_and_must_match() public {
        _openRotation();
        vm.prank(relayer);
        vm.expectRevert();
        store.revealRotation(ROTATION, SECRET);

        vm.warp(block.timestamp + 30 hours);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardStore.SecretMismatch.selector, ROTATION));
        store.revealRotation(ROTATION, keccak256("a different secret"));
    }

    function test_no_purchase_after_the_rotation_closes() public {
        _openRotation();
        vm.warp(block.timestamp + 30 hours);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardStore.RotationClosed.selector, ROTATION));
        store.purchase(bytes32("late"), alice, ROTATION, _templates(), _deadline(), "");
    }

    function test_overdue_reveal_is_visible() public {
        _openRotation();
        vm.warp(block.timestamp + 30 hours + 24 hours + 1);
        assertTrue(store.rotationOverdue(ROTATION));
        vm.prank(relayer);
        store.revealRotation(ROTATION, SECRET);
        assertFalse(store.rotationOverdue(ROTATION));
    }

    function test_rotation_cannot_be_committed_twice() public {
        _openRotation();
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(GachardStore.AlreadyCommitted.selector, ROTATION));
        store.commitRotation(
            ROTATION, keccak256("other"), uint40(block.timestamp + 6 hours), uint40(block.timestamp + 30 hours)
        );
    }

    function test_only_pyth_can_deliver_the_seed() public {
        vm.prank(relayer);
        store.commitRotation(
            ROTATION, keccak256(abi.encode(SECRET)), uint40(block.timestamp + 6 hours), uint40(block.timestamp + 30 hours)
        );
        vm.prank(relayer);
        uint64 seq = store.requestRotationEntropy(ROTATION);
        vm.expectRevert();
        IEntropyConsumer(address(store))._entropyCallback(seq, provider, keccak256("forged"));
    }

    function test_attestor_must_cosign_when_set() public {
        store.setAttestor(attestorAddr);
        _openRotation();
        uint32[] memory t = _templates();
        uint256 deadline = _deadline();

        vm.prank(relayer);
        vm.expectRevert(GachardStore.BadAttestation.selector);
        store.purchase(bytes32("p1"), alice, ROTATION, t, deadline, _sign(RELAYER_KEY, bytes32(0)));

        bytes memory attestation = _attest(bytes32("p1"), alice, t, deadline);
        vm.prank(relayer);
        store.purchase(bytes32("p1"), alice, ROTATION, t, deadline, attestation);

        // The same attestation cannot be bent to another buyer.
        bytes memory forBob = _attest(bytes32("p2"), alice, t, deadline);
        vm.prank(relayer);
        vm.expectRevert(GachardStore.BadAttestation.selector);
        store.purchase(bytes32("p2"), bob, ROTATION, t, deadline, forBob);
    }

    function test_withdraw_is_admin_only_and_works() public {
        address payable to = payable(makeAddr("treasury"));
        vm.prank(relayer);
        vm.expectRevert();
        store.withdraw(to, 1);
        store.withdraw(to, 0.5 ether);
        assertEq(to.balance, 0.5 ether);
    }

    function test_store_mints_count_against_the_store_share_only() public {
        _openRotation();
        uint32[] memory t = new uint32[](1);
        t[0] = T_LIMITED;
        vm.startPrank(relayer);
        store.purchase(bytes32("l1"), alice, ROTATION, t, _deadline(), "");
        vm.expectRevert(
            abi.encodeWithSelector(GachardCards.SupplyExhausted.selector, T_LIMITED, GachardCards.Channel.Store)
        );
        store.purchase(bytes32("l2"), bob, ROTATION, t, _deadline(), "");
        vm.stopPrank();
        assertEq(cards.remaining(T_LIMITED, GachardCards.Channel.Album), 2);
    }
}
