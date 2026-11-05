// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {GachardCards} from "../../src/v2/GachardCards.sol";
import {GachardStore} from "../../src/v2/GachardStore.sol";
import {GachardAlbums} from "../../src/v2/GachardAlbums.sol";
import {V2Setup} from "./V2Setup.sol";

/**
 * @notice Step 3: make the timelock admin of every v2 contract; the deployer renounces.
 * @dev Irreversible. Afterwards every admin action takes the Safe plus 48 hours.
 *      Environment: DEPLOYER_PRIVATE_KEY, V2_TIMELOCK, V2_CARDS, V2_STORE, V2_ALBUMS.
 */
contract HandoverV2 is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        V2Setup.Deployment memory d = V2Setup.Deployment({
            timelock: TimelockController(payable(vm.envAddress("V2_TIMELOCK"))),
            cards: GachardCards(vm.envAddress("V2_CARDS")),
            store: GachardStore(payable(vm.envAddress("V2_STORE"))),
            albums: GachardAlbums(vm.envAddress("V2_ALBUMS"))
        });

        vm.startBroadcast(key);
        V2Setup.handover(d, vm.addr(key));
        vm.stopBroadcast();

        console.log("Handover done. Run CheckV2 now.");
    }
}
