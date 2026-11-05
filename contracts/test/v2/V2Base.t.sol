// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {GachardCards} from "../../src/v2/GachardCards.sol";

/// @notice A contract wallet that accepts signatures from its owner key (ERC-1271).
contract MockSmartWallet is ERC1155Holder, IERC1271 {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(hash, signature);
        return err == ECDSA.RecoverError.NoError && recovered == owner ? IERC1271.isValidSignature.selector : bytes4(0);
    }
}

/// @notice Shared setup for the v2 tests: one ledger, one Series, keys and signing helpers.
abstract contract V2Base is Test, ERC1155Holder {
    GachardCards internal cards;

    uint256 internal constant RELAYER_KEY = 0xA11CE;
    uint256 internal constant ALICE_KEY = 0xA1;
    uint256 internal constant BOB_KEY = 0xB0B;
    uint256 internal constant CAROL_KEY = 0xCA401;
    uint256 internal constant ATTESTOR_KEY = 0xA77E57;

    address internal relayer = vm.addr(RELAYER_KEY);
    address internal alice = vm.addr(ALICE_KEY);
    address internal bob = vm.addr(BOB_KEY);
    address internal carol = vm.addr(CAROL_KEY);
    address internal attestorAddr = vm.addr(ATTESTOR_KEY);
    address internal guardian = makeAddr("guardian");
    address internal unpauser = makeAddr("unpauser");

    uint32 internal constant SERIES = 1;
    uint32 internal constant T_COMMON = 101;
    uint32 internal constant T_COMMON_2 = 102;
    uint32 internal constant T_RARE = 103;
    uint32 internal constant T_LIMITED = 201; // album share 2, store share 1
    uint32 internal constant T_COMPLETION = 301;
    uint32 internal constant T_DRAFT = 999; // registered, never launched

    function setUp() public virtual {
        vm.warp(1_760_000_000);
        cards = new GachardCards(address(this), guardian, unpauser);

        cards.registerTemplate(T_COMMON, SERIES, 0, GachardCards.Kind.Standard, 0, 0);
        cards.registerTemplate(T_COMMON_2, SERIES, 0, GachardCards.Kind.Standard, 0, 0);
        cards.registerTemplate(T_RARE, SERIES, 1, GachardCards.Kind.Standard, 0, 0);
        cards.registerTemplate(T_LIMITED, SERIES, 3, GachardCards.Kind.Limited, 2, 1);
        cards.registerTemplate(T_COMPLETION, SERIES, 0, GachardCards.Kind.Completion, 0, 0);
        cards.registerTemplate(T_DRAFT, SERIES, 0, GachardCards.Kind.Standard, 0, 0);

        uint32[] memory live = new uint32[](5);
        live[0] = T_COMMON;
        live[1] = T_COMMON_2;
        live[2] = T_RARE;
        live[3] = T_LIMITED;
        live[4] = T_COMPLETION;
        cards.setTemplatesLive(live);

        cards.setLimit(cards.LIMIT_MINT(), 1_000);
        cards.setLimit(cards.LIMIT_TRANSFER(), 1_000);
        cards.setLimit(cards.LIMIT_BURN(), 1_000);
        cards.setLimit(cards.LIMIT_REDEEM(), 1_000);

        // The test contract stands in for a module: it has code, so it may hold MINTER_ROLE.
        cards.grantRole(cards.MINTER_ROLE(), address(this));
        cards.grantRole(cards.STATUS_ROLE(), address(this));
        cards.grantRole(cards.RELAYER_ROLE(), relayer);
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    function _mint(address to, uint32 templateId) internal returns (uint256) {
        uint32[] memory t = new uint32[](1);
        t[0] = templateId;
        return cards.mint(to, t, GachardCards.Channel.Store);
    }

    function _ids(uint256 a) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = a;
    }

    function _ids(uint256 a, uint256 b) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
    }

    function _digest(bytes32 domainSeparator, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _transferSig(uint256 key, address from, address to, uint256[] memory ids, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(cards.TRANSFER_TYPEHASH(), from, to, keccak256(abi.encodePacked(ids)), nonce, deadline)
        );
        return _sign(key, _digest(cards.domainSeparator(), structHash));
    }

    function _burnSig(uint256 key, address holder, uint256[] memory ids, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash =
            keccak256(abi.encode(cards.BURN_TYPEHASH(), holder, keccak256(abi.encodePacked(ids)), nonce, deadline));
        return _sign(key, _digest(cards.domainSeparator(), structHash));
    }

    function _printSig(uint256 key, address holder, uint256 id, bytes32 commit, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(cards.PRINT_TYPEHASH(), holder, id, commit, nonce, deadline));
        return _sign(key, _digest(cards.domainSeparator(), structHash));
    }

    function _cancelSig(uint256 key, address holder, uint256 id, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(cards.PRINT_CANCEL_TYPEHASH(), holder, id, nonce, deadline));
        return _sign(key, _digest(cards.domainSeparator(), structHash));
    }

    /// @dev How the backend computes a print commitment: keccak256, not sha3-256 (ADR-040).
    function _commit(uint256 id, uint32 printCycle, bytes memory code) internal pure returns (bytes32) {
        return keccak256(abi.encode(id, printCycle, code));
    }

    function _deadline() internal view returns (uint256) {
        return block.timestamp + 10 minutes;
    }
}
