// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {MockEntropy} from "@pythnetwork/entropy-sdk-solidity/MockEntropy.sol";
import {GachardCards} from "../../src/v2/GachardCards.sol";
import {GachardStore} from "../../src/v2/GachardStore.sol";
import {GachardAlbums} from "../../src/v2/GachardAlbums.sol";

/**
 * @notice Feeds what the backend computes (frontend/lib/v2/chain-v2.ts, via
 *         frontend/scripts/v2-vectors.mjs) to the real contracts.
 * @dev Every signature, commit, hash and proof below was produced in TypeScript.
 *      If the two sides ever disagree, this fails. Regenerate the vectors after
 *      changing either side:  cd frontend && node scripts/v2-vectors.mjs
 */
contract V2VectorsTest is Test {
    using stdJson for string;

    string internal json;
    GachardCards internal cards;
    GachardStore internal store;
    GachardAlbums internal albums;
    MockEntropy internal mockEntropy;

    address internal relayer = makeAddr("relayer");
    address internal guardian = makeAddr("guardian");
    address internal unpauser = makeAddr("unpauser");
    address internal provider = address(0xAAAA);
    address internal alice;
    address internal bob;

    function setUp() public {
        json = vm.readFile("test/v2/vectors/v2-vectors.json");
        vm.chainId(json.readUint(".chainId"));
        vm.warp(json.readUint(".timestamp"));
        alice = json.readAddress(".accounts.alice");
        bob = json.readAddress(".accounts.bob");
        mockEntropy = new MockEntropy(provider);

        // At the addresses the vectors were signed for.
        address cardsAt = json.readAddress(".addresses.cards");
        deployCodeTo("GachardCards.sol:GachardCards", abi.encode(address(this), guardian, unpauser), cardsAt);
        cards = GachardCards(cardsAt);
        address storeAt = json.readAddress(".addresses.store");
        deployCodeTo(
            "GachardStore.sol:GachardStore",
            abi.encode(address(mockEntropy), cardsAt, address(this), guardian, unpauser),
            storeAt
        );
        store = GachardStore(payable(storeAt));
        address albumsAt = json.readAddress(".addresses.albums");
        deployCodeTo("GachardAlbums.sol:GachardAlbums", abi.encode(cardsAt, address(this), guardian, unpauser), albumsAt);
        albums = GachardAlbums(albumsAt);

        cards.registerTemplate(101, 1, 0, GachardCards.Kind.Standard, 0, 0);
        cards.registerTemplate(102, 1, 0, GachardCards.Kind.Standard, 0, 0);
        cards.registerTemplate(103, 1, 1, GachardCards.Kind.Standard, 0, 0);
        cards.registerTemplate(201, 1, 3, GachardCards.Kind.Limited, 2, 1);
        cards.registerTemplate(301, 1, 0, GachardCards.Kind.Completion, 0, 0);
        uint32[] memory live = new uint32[](5);
        (live[0], live[1], live[2], live[3], live[4]) = (101, 102, 103, 201, 301);
        cards.setTemplatesLive(live);

        cards.setLimit(cards.LIMIT_MINT(), 100);
        cards.setLimit(cards.LIMIT_TRANSFER(), 100);
        cards.setLimit(cards.LIMIT_BURN(), 100);
        cards.setLimit(cards.LIMIT_REDEEM(), 100);
        store.setLimit(store.LIMIT_PURCHASE_CARDS(), 100);
        albums.setLimit(albums.LIMIT_WISH(), 100);
        albums.setLimit(albums.LIMIT_REWARD(), 100);

        cards.grantRole(cards.MINTER_ROLE(), address(this));
        cards.grantRole(cards.MINTER_ROLE(), address(store));
        cards.grantRole(cards.MINTER_ROLE(), address(albums));
        cards.grantRole(cards.STATUS_ROLE(), address(albums));
        cards.grantRole(cards.RELAYER_ROLE(), relayer);
        store.grantRole(store.RELAYER_ROLE(), relayer);
        albums.grantRole(albums.RELAYER_ROLE(), relayer);
        store.setAttestor(json.readAddress(".accounts.attestor"));
        albums.setAttestor(json.readAddress(".accounts.attestor"));
        vm.deal(address(store), 1 ether);
    }

    function _mint(address to, uint32 templateId) internal returns (uint256) {
        uint32[] memory t = new uint32[](1);
        t[0] = templateId;
        return cards.mint(to, t, GachardCards.Channel.Store);
    }

    function _u32(uint256[] memory a) internal pure returns (uint32[] memory out) {
        out = new uint32[](a.length);
        for (uint256 i = 0; i < a.length; i++) out[i] = uint32(a[i]);
    }

    function _u16(uint256[] memory a) internal pure returns (uint16[] memory out) {
        out = new uint16[](a.length);
        for (uint256 i = 0; i < a.length; i++) out[i] = uint16(a[i]);
    }

    /// @dev One scenario, in the order the vectors' token ids assume.
    function test_backend_output_is_accepted_by_the_contracts() public {
        // Tokens 1–3, as the vectors expect.
        assertEq(_mint(alice, 101), 1);
        assertEq(_mint(alice, 101), 2);
        assertEq(_mint(alice, 103), 3);

        // Holder-signed transfer.
        vm.prank(relayer);
        cards.transferWithSig(
            alice,
            bob,
            json.readUintArray(".transfer.ids"),
            json.readUint(".transfer.nonce"),
            json.readUint(".transfer.deadline"),
            json.readBytes(".transfer.signature")
        );
        assertEq(cards.holderOf(1), bob);

        // Holder-signed burn.
        vm.prank(relayer);
        cards.burnWithSig(
            alice,
            json.readUintArray(".burn.ids"),
            json.readUint(".burn.nonce"),
            json.readUint(".burn.deadline"),
            json.readBytes(".burn.signature")
        );
        assertEq(cards.holderOf(2), address(0));

        // Print commit from TypeScript; redeem with the bytes TypeScript derived from a
        // carelessly typed code (lower case, dashes, O for 0).
        vm.prank(relayer);
        cards.requestPrintWithSig(
            alice,
            3,
            json.readBytes32(".print.commit"),
            json.readUint(".print.nonce"),
            json.readUint(".print.deadline"),
            json.readBytes(".print.signature")
        );
        vm.prank(relayer);
        cards.redeem(3, json.readBytes(".print.codeBytes"), bob);
        assertEq(cards.holderOf(3), bob);

        // Rotation commit-reveal and store randomness.
        bytes32 secret = json.readBytes32(".rotation.secret");
        bytes32 seed = json.readBytes32(".rotation.seed");
        uint256 rotationId = json.readUint(".rotation.rotationId");
        assertEq(keccak256(abi.encode(secret)), json.readBytes32(".rotation.secretHash"));
        assertEq(
            keccak256(abi.encode(seed, secret, alice, rotationId, uint256(0))),
            json.readBytes32(".rotation.storeRandom0"),
            "storeRandom must match the on-chain formula"
        );
        vm.startPrank(relayer);
        store.commitRotation(
            rotationId,
            json.readBytes32(".rotation.secretHash"),
            uint40(block.timestamp + 6 hours),
            uint40(block.timestamp + 30 hours)
        );
        uint64 seq = store.requestRotationEntropy(rotationId);
        vm.stopPrank();
        mockEntropy.mockReveal(provider, seq, seed);

        // Purchase co-signed by the attestor in TypeScript: tokens 4–5.
        vm.prank(relayer);
        uint256 firstBought = store.purchase(
            json.readBytes32(".purchase.purchaseId"),
            alice,
            rotationId,
            _u32(json.readUintArray(".purchase.templateIds")),
            json.readUint(".purchase.deadline"),
            json.readBytes(".purchase.attestation")
        );
        assertEq(firstBought, 4);

        // Album: season, tokens 6–7 placed with the holder's TypeScript signature.
        uint32[] memory slots = new uint32[](3);
        (slots[0], slots[1], slots[2]) = (101, 102, 103);
        albums.registerSeason(1, 1, 201, 301, uint40(block.timestamp), uint40(block.timestamp + 90 days), slots);
        assertEq(_mint(alice, 101), 6);
        assertEq(_mint(alice, 102), 7);
        vm.prank(relayer);
        albums.placeInAlbum(
            alice,
            json.readUint(".place.seasonId"),
            json.readUintArray(".place.ids"),
            _u16(json.readUintArray(".place.slots")),
            json.readUint(".place.nonce"),
            json.readUint(".place.deadline"),
            json.readBytes(".place.signature")
        );

        // Wish: holder and attestor signatures from TypeScript.
        vm.prank(relayer);
        albums.wishIntoAlbum(
            alice,
            1,
            uint16(json.readUint(".wish.slot")),
            json.readUint(".wish.nonce"),
            json.readUint(".wish.deadline"),
            json.readBytes(".wish.signature"),
            json.readBytes(".wish.attestation")
        );
        assertEq(albums.filledCount(1, alice), 3);

        // Rewards with the attestor's TypeScript signature.
        vm.prank(relayer);
        (uint256 completion, uint256 limited) = albums.claimRewards(
            alice, 1, json.readUint(".reward.deadline"), json.readBytes(".reward.attestation")
        );
        assertEq(cards.cardOf(completion).serial, 1);
        assertEq(cards.templateOf(limited), 201);
    }

    /// @dev A v1 code moving with its printed card: committed byte for byte, never normalised.
    function test_backend_legacy_code_commit_matches_the_ledger_formula() public view {
        string memory code = json.readString(".legacy.code");
        assertEq(json.readBytes(".legacy.codeBytes"), bytes(code));
        assertEq(keccak256(abi.encode(uint256(3), uint32(1), bytes(code))), json.readBytes32(".legacy.commit"));
    }

    function test_backend_merkle_tree_verifies_with_openzeppelin() public view {
        bytes32 root = json.readBytes32(".merkle.root");
        for (uint256 i = 0; i < 5; i++) {
            string memory p = string.concat(".merkle.entries[", vm.toString(i), "]");
            bytes32 leaf = keccak256(
                bytes.concat(
                    keccak256(
                        abi.encode(
                            json.readUint(string.concat(p, ".v1TokenId")),
                            json.readAddress(string.concat(p, ".holder")),
                            uint32(json.readUint(string.concat(p, ".templateId"))),
                            uint8(json.readUint(string.concat(p, ".kind")))
                        )
                    )
                )
            );
            assertEq(leaf, json.readBytes32(string.concat(p, ".leaf")), "leaf encoding differs");
            assertTrue(
                MerkleProof.verify(json.readBytes32Array(string.concat(p, ".proof")), root, leaf), "proof rejected"
            );
        }
    }
}
