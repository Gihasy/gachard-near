// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {GachardCards} from "../../src/v2/GachardCards.sol";
import {V2Setup} from "../../script/v2/V2Setup.sol";

/// @notice The deploy, handover and check steps exactly as the scripts run them.
contract DeployV2Test is Test {
    address internal safe = makeAddr("safe");
    address internal guardian = makeAddr("guardian");
    address internal relayer1 = makeAddr("relayer1");
    address internal relayer2 = makeAddr("relayer2");
    address internal entropy = makeAddr("pyth");
    address internal v1Admin = makeAddr("v1Admin");

    V2Setup.Deployment internal d;

    function _relayers() internal view returns (address[] memory r) {
        r = new address[](2);
        r[0] = relayer1;
        r[1] = relayer2;
    }

    function _config() internal view returns (V2Setup.Config memory) {
        return V2Setup.Config({
            safe: safe,
            guardian: guardian,
            relayers: _relayers(),
            entropy: entropy,
            attestor: address(0),
            timelockDelay: 2 days,
            limitPerHour: 500,
            requireSafeIsContract: false
        });
    }

    function _expect() internal view returns (V2Setup.Expect memory) {
        return V2Setup.Expect({
            deployer: address(this),
            safe: safe,
            guardian: guardian,
            relayers: _relayers(),
            entropy: entropy,
            attestor: address(0),
            timelockDelay: 2 days,
            v1Admin: v1Admin
        });
    }

    /// @dev External so vm.expectRevert can see the library's revert.
    function runCheck() external view {
        V2Setup.check(d, _expect());
    }

    function runDeploy(V2Setup.Config memory cfg) external {
        V2Setup.deploy(cfg, address(this));
    }

    function test_deploy_handover_then_check_passes() public {
        d = V2Setup.deploy(_config(), address(this));
        V2Setup.handover(d, address(this));
        this.runCheck();
    }

    function test_check_fails_while_the_deployer_is_still_admin() public {
        d = V2Setup.deploy(_config(), address(this));
        vm.expectRevert(bytes("timelock: deployer is admin"));
        this.runCheck();
    }

    function test_check_fails_on_a_stray_relayer() public {
        d = V2Setup.deploy(_config(), address(this));
        d.cards.grantRole(d.cards.RELAYER_ROLE(), makeAddr("stray"));
        V2Setup.handover(d, address(this));
        vm.expectRevert(bytes("RELAYER_ROLE must be exactly the relayers"));
        this.runCheck();
    }

    function test_check_fails_if_the_v1_admin_was_given_anything() public {
        d = V2Setup.deploy(_config(), address(this));
        d.cards.grantRole(d.cards.RELAYER_ROLE(), v1Admin);
        V2Setup.handover(d, address(this));
        vm.expectRevert(bytes("RELAYER_ROLE must be exactly the relayers"));
        this.runCheck();
    }

    function test_deploy_refuses_a_guardian_that_is_the_safe() public {
        V2Setup.Config memory cfg = _config();
        cfg.guardian = safe;
        vm.expectRevert(bytes("config: guardian must not be the Safe"));
        this.runDeploy(cfg);
    }

    function test_deploy_refuses_a_safe_without_code_on_a_real_chain() public {
        V2Setup.Config memory cfg = _config();
        cfg.requireSafeIsContract = true;
        vm.expectRevert(bytes("config: Safe address has no code"));
        this.runDeploy(cfg);
    }

    function test_deploy_refuses_a_relayer_that_is_another_key() public {
        V2Setup.Config memory cfg = _config();
        cfg.relayers[1] = guardian;
        vm.expectRevert(bytes("config: relayer must be its own key"));
        this.runDeploy(cfg);
    }

    /// @dev The admin path end to end: the Safe queues, waits 48 hours, executes.
    ///      The Guardian lowers instantly.
    function test_raising_a_limit_takes_the_safe_and_48_hours_lowering_is_instant() public {
        d = V2Setup.deploy(_config(), address(this));
        V2Setup.handover(d, address(this));
        bytes32 action = d.cards.LIMIT_BURN();
        bytes memory call = abi.encodeCall(GachardCards.setLimit, (action, uint64(2_000)));

        vm.expectRevert();
        d.cards.setLimit(action, 2_000); // the deployer kept nothing

        vm.prank(safe);
        d.timelock.schedule(address(d.cards), 0, call, bytes32(0), bytes32("raise"), 2 days);

        vm.prank(safe);
        vm.expectRevert();
        d.timelock.execute(address(d.cards), 0, call, bytes32(0), bytes32("raise"));

        vm.warp(block.timestamp + 2 days);
        vm.prank(safe);
        d.timelock.execute(address(d.cards), 0, call, bytes32(0), bytes32("raise"));
        assertEq(d.cards.limitOf(action), 2_000);

        vm.prank(guardian);
        d.cards.lowerLimit(action, 10);
        assertEq(d.cards.limitOf(action), 10);
    }

    /// @dev If two Safe keys were stolen, whatever they queue can still be cancelled by the Guardian.
    function test_guardian_cancels_an_admin_action_queued_by_a_stolen_safe() public {
        d = V2Setup.deploy(_config(), address(this));
        V2Setup.handover(d, address(this));
        bytes memory call = abi.encodeCall(GachardCards.setURI, ("https://phishing.invalid/{id}"));
        vm.prank(safe);
        d.timelock.schedule(address(d.cards), 0, call, bytes32(0), bytes32("evil"), 2 days);
        bytes32 opId = d.timelock.hashOperation(address(d.cards), 0, call, bytes32(0), bytes32("evil"));

        vm.prank(guardian);
        d.timelock.cancel(opId);

        vm.warp(block.timestamp + 2 days);
        vm.prank(safe);
        vm.expectRevert();
        d.timelock.execute(address(d.cards), 0, call, bytes32(0), bytes32("evil"));
        assertEq(d.cards.uri(1), "");
    }

    function test_guardian_cannot_propose_admin_actions() public {
        d = V2Setup.deploy(_config(), address(this));
        V2Setup.handover(d, address(this));
        bytes memory call = abi.encodeCall(GachardCards.setURI, ("x"));
        vm.prank(guardian);
        vm.expectRevert();
        d.timelock.schedule(address(d.cards), 0, call, bytes32(0), bytes32("g"), 2 days);
    }

    /// @dev A leaked relayer is cut off at once by the Guardian; the other keeps working.
    function test_guardian_revokes_one_relayer_and_the_other_stays() public {
        d = V2Setup.deploy(_config(), address(this));
        V2Setup.handover(d, address(this));
        bytes32 role = d.cards.RELAYER_ROLE();
        vm.prank(guardian);
        d.cards.emergencyRevoke(role, relayer1);
        assertFalse(d.cards.hasRole(role, relayer1));
        assertTrue(d.cards.hasRole(role, relayer2));
    }
}
