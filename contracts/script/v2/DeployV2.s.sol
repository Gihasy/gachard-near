// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {V2Setup} from "./V2Setup.sol";

/**
 * @notice Step 1: deploy and wire v2. The deployer stays admin until HandoverV2.
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY  a fresh, single-use key. Never the v1 admin key.
 *   V2_SAFE               the 2-of-3 Safe (must already exist on this chain)
 *   V2_GUARDIAN           a separate account on a hardware wallet
 *   V2_RELAYERS           comma-separated, normally two
 *   V2_ENTROPY            Pyth Entropy (default: Monad Testnet, ADR-029)
 *   V2_ATTESTOR           optional on testnet (D3)
 *   V2_TIMELOCK_DELAY     seconds, default 172800 (48 h, D7)
 *   V2_LIMIT_PER_HOUR     default 500
 *
 *   FOUNDRY_PROFILE=v2 forge script script/v2/DeployV2.s.sol --rpc-url monad_testnet --broadcast
 *
 * The v2 profile turns the optimizer on: without it GachardCards is 37 KB, over
 * Ethereum's 24 KB limit (Monad allows 128 KB, MIP-2), and every call costs more.
 */
contract DeployV2 is Script {
    address internal constant MONAD_TESTNET_PYTH_ENTROPY = 0x825c0390f379C631f3Cf11A82a37D20BddF93c07;

    function run() external returns (V2Setup.Deployment memory d) {
        require(
            keccak256(bytes(vm.envOr("FOUNDRY_PROFILE", string("")))) == keccak256("v2"),
            "run with FOUNDRY_PROFILE=v2 (optimizer on)"
        );
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);

        V2Setup.Config memory cfg = V2Setup.Config({
            safe: vm.envAddress("V2_SAFE"),
            guardian: vm.envAddress("V2_GUARDIAN"),
            relayers: vm.envAddress("V2_RELAYERS", ","),
            entropy: vm.envOr("V2_ENTROPY", MONAD_TESTNET_PYTH_ENTROPY),
            attestor: vm.envOr("V2_ATTESTOR", address(0)),
            timelockDelay: vm.envOr("V2_TIMELOCK_DELAY", uint256(2 days)),
            limitPerHour: uint64(vm.envOr("V2_LIMIT_PER_HOUR", uint256(500))),
            requireSafeIsContract: true
        });

        vm.startBroadcast(key);
        d = V2Setup.deploy(cfg, deployer);
        vm.stopBroadcast();

        console.log("Deployer (temporary admin):", deployer);
        console.log("V2_TIMELOCK=", address(d.timelock));
        console.log("V2_CARDS=", address(d.cards));
        console.log("V2_STORE=", address(d.store));
        console.log("V2_ALBUMS=", address(d.albums));
        console.log("Next: fund GachardStore with MON for entropy fees, register any content, then run HandoverV2.");
    }
}
