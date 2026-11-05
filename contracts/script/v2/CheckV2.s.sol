// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {GachardCards} from "../../src/v2/GachardCards.sol";
import {GachardStore} from "../../src/v2/GachardStore.sol";
import {GachardAlbums} from "../../src/v2/GachardAlbums.sol";
import {V2Setup} from "./V2Setup.sol";

/**
 * @notice Read every role and parameter back; revert on any difference from the plan.
 * @dev Read-only, never broadcasts. Run after HandoverV2 and after any role change.
 *      Environment: V2_TIMELOCK, V2_CARDS, V2_STORE, V2_ALBUMS, V2_DEPLOYER,
 *      V2_SAFE, V2_GUARDIAN, V2_RELAYERS, optional V2_ENTROPY, V2_ATTESTOR,
 *      V2_TIMELOCK_DELAY, V1_ADMIN.
 *
 *   FOUNDRY_PROFILE=v2 forge script script/v2/CheckV2.s.sol --rpc-url monad_testnet
 */
contract CheckV2 is Script {
    address internal constant MONAD_TESTNET_PYTH_ENTROPY = 0x825c0390f379C631f3Cf11A82a37D20BddF93c07;

    function run() external view {
        V2Setup.Deployment memory d = V2Setup.Deployment({
            timelock: TimelockController(payable(vm.envAddress("V2_TIMELOCK"))),
            cards: GachardCards(vm.envAddress("V2_CARDS")),
            store: GachardStore(payable(vm.envAddress("V2_STORE"))),
            albums: GachardAlbums(vm.envAddress("V2_ALBUMS"))
        });
        V2Setup.Expect memory e = V2Setup.Expect({
            deployer: vm.envAddress("V2_DEPLOYER"),
            safe: vm.envAddress("V2_SAFE"),
            guardian: vm.envAddress("V2_GUARDIAN"),
            relayers: vm.envAddress("V2_RELAYERS", ","),
            entropy: vm.envOr("V2_ENTROPY", MONAD_TESTNET_PYTH_ENTROPY),
            attestor: vm.envOr("V2_ATTESTOR", address(0)),
            timelockDelay: vm.envOr("V2_TIMELOCK_DELAY", uint256(2 days)),
            v1Admin: vm.envOr("V1_ADMIN", address(0))
        });
        V2Setup.check(d, e);
        console.log("CheckV2: every role and parameter matches the plan.");
    }
}
