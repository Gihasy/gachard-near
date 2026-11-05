// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {MockEntropy} from "@pythnetwork/entropy-sdk-solidity/MockEntropy.sol";
import {GachardCards} from "../../src/v2/GachardCards.sol";
import {V2Setup} from "./V2Setup.sol";

/**
 * @notice v2 on a local anvil chain, for development and the backend's
 *         integration test (frontend/scripts/v2-local.test.mjs). Never for a
 *         real network: it uses anvil's public test keys, a mock Pyth, a
 *         one-day timelock, and keeps the deployer as admin so content can
 *         change without waiting.
 *
 *   anvil --port 8546
 *   FOUNDRY_PROFILE=v2 forge script script/v2/LocalDevV2.s.sol --rpc-url http://127.0.0.1:8546 --broadcast
 *
 * Accounts (anvil's defaults): 0 deployer, 1 Safe, 2 Guardian, 3–4 Relayers.
 * Writes the addresses to deployments/local-v2.json (git-ignored).
 */
contract LocalDevV2 is Script {
    using stdJson for string;

    // anvil's well-known development keys; worthless anywhere else.
    uint256 internal constant ANVIL_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant ANVIL_1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address internal constant ANVIL_2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address internal constant ANVIL_3 = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
    address internal constant ANVIL_4 = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;

    function run() external {
        require(block.chainid == 31337, "LocalDevV2 is for a local anvil chain only");
        address deployer = vm.addr(ANVIL_0);
        string memory season = vm.readFile("script/v2/season0.json");

        vm.startBroadcast(ANVIL_0);
        MockEntropy entropy = new MockEntropy(deployer);

        address[] memory relayers = new address[](2);
        relayers[0] = ANVIL_3;
        relayers[1] = ANVIL_4;
        V2Setup.Deployment memory d = V2Setup.deploy(
            V2Setup.Config({
                safe: ANVIL_1,
                guardian: ANVIL_2,
                relayers: relayers,
                entropy: address(entropy),
                attestor: address(0),
                timelockDelay: 1 days,
                limitPerHour: 10_000,
                requireSafeIsContract: false
            }),
            deployer
        );

        uint32 seriesId = uint32(season.readUint(".seriesId"));
        uint256[] memory slots = season.readUintArray(".albumSlots");
        uint256[] memory rarities = season.readUintArray(".rarities");
        uint32 limitedId = uint32(season.readUint(".limited.templateId"));
        uint32 completionId = uint32(season.readUint(".completion.templateId"));

        uint32[] memory live = new uint32[](slots.length + 2);
        uint32[] memory albumSlots = new uint32[](slots.length);
        for (uint256 i = 0; i < slots.length; i++) {
            d.cards.registerTemplate(
                uint32(slots[i]), seriesId, uint8(rarities[i]), GachardCards.Kind.Standard, 0, 0
            );
            live[i] = uint32(slots[i]);
            albumSlots[i] = uint32(slots[i]);
        }
        d.cards.registerTemplate(
            limitedId,
            seriesId,
            uint8(season.readUint(".limited.rarity")),
            GachardCards.Kind.Limited,
            uint32(season.readUint(".limited.albumCap")),
            uint32(season.readUint(".limited.storeCap"))
        );
        d.cards.registerTemplate(completionId, seriesId, 0, GachardCards.Kind.Completion, 0, 0);
        live[slots.length] = limitedId;
        live[slots.length + 1] = completionId;
        d.cards.setTemplatesLive(live);

        // Two minutes ahead of the wall clock: the season must start in the future when the
        // transaction lands, and a fresh anvil reports its start time as the latest block.
        uint256 startsAt = vm.unixTime() / 1000 + 120;
        d.albums.registerSeason(
            season.readUint(".seasonId"),
            seriesId,
            limitedId,
            completionId,
            uint40(startsAt),
            uint40(startsAt + season.readUint(".seasonDays") * 1 days),
            albumSlots
        );
        (bool funded, ) = payable(address(d.store)).call{value: 1 ether}("");
        require(funded, "could not fund the store");
        vm.stopBroadcast();

        vm.createDir("deployments", true);
        string memory key = "local";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "entropy", address(entropy));
        vm.serializeAddress(key, "timelock", address(d.timelock));
        vm.serializeAddress(key, "cards", address(d.cards));
        vm.serializeAddress(key, "store", address(d.store));
        string memory out = vm.serializeAddress(key, "albums", address(d.albums));
        vm.writeJson(out, "deployments/local-v2.json");
        console.log("Local v2 deployed; addresses in deployments/local-v2.json");
    }
}
