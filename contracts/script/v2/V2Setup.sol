// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {GachardCards} from "../../src/v2/GachardCards.sol";
import {GachardStore} from "../../src/v2/GachardStore.sol";
import {GachardAlbums} from "../../src/v2/GachardAlbums.sol";

/**
 * @title V2Setup
 * @notice Deploy, hand over and check the v2 contracts (docs/CONTRACT-V2-SPEC.md §14, §16).
 * @dev One library for the real scripts and the tests, so what is tested is
 *      what runs. Three steps:
 *      1. `deploy`: the deployer is temporary admin, wires roles and limits.
 *      2. Content that must exist before handover (templates for the
 *         migration, a first season) can be registered while the deployer
 *         is still admin.
 *      3. `handover`: the timelock becomes admin and the deployer renounces,
 *         keeping nothing.
 *      `check` then reads every role and parameter back, and reverts on any
 *      difference from the plan.
 */
library V2Setup {
    bytes32 internal constant DEFAULT_ADMIN_ROLE = 0x00;

    struct Config {
        address safe; // 2-of-3, proposes to the timelock, unpauses (D1)
        address guardian; // cold key, not a Safe signer address
        address[] relayers; // two, so one can be revoked without stopping the platform
        address entropy; // Pyth Entropy
        address attestor; // zero on testnet; required before mainnet (D3)
        uint256 timelockDelay; // 48 h (D7)
        uint64 limitPerHour; // every limit; raise later through the timelock
        bool requireSafeIsContract; // true on a real chain: refuses a mistyped EOA
    }

    struct Deployment {
        TimelockController timelock;
        GachardCards cards;
        GachardStore store;
        GachardAlbums albums;
    }

    struct Expect {
        address deployer;
        address safe;
        address guardian;
        address[] relayers;
        address entropy;
        address attestor;
        uint256 timelockDelay;
        address v1Admin; // optional: must hold nothing in v2
    }

    // ═══ 1. Deploy ══════════════════════════════════════════════════════════

    function deploy(Config memory cfg, address deployer) internal returns (Deployment memory d) {
        _checkConfig(cfg, deployer);

        address[] memory safeOnly = new address[](1);
        safeOnly[0] = cfg.safe;
        // The deployer is the timelock's admin only long enough to make the Guardian a
        // canceller too: cancelling a queued admin action removes risk, so the cold key
        // may do it at once. If two Safe keys are ever stolen, the Guardian can still
        // cancel whatever they queue. Handover renounces this admin seat.
        d.timelock = new TimelockController(cfg.timelockDelay, safeOnly, safeOnly, deployer);
        d.timelock.grantRole(d.timelock.CANCELLER_ROLE(), cfg.guardian);

        d.cards = new GachardCards(deployer, cfg.guardian, cfg.safe);
        d.store = new GachardStore(cfg.entropy, d.cards, deployer, cfg.guardian, cfg.safe);
        d.albums = new GachardAlbums(d.cards, deployer, cfg.guardian, cfg.safe);

        d.cards.grantRole(d.cards.MINTER_ROLE(), address(d.store));
        d.cards.grantRole(d.cards.MINTER_ROLE(), address(d.albums));
        d.cards.grantRole(d.cards.STATUS_ROLE(), address(d.albums));

        for (uint256 i = 0; i < cfg.relayers.length; i++) {
            d.cards.grantRole(d.cards.RELAYER_ROLE(), cfg.relayers[i]);
            d.store.grantRole(d.store.RELAYER_ROLE(), cfg.relayers[i]);
            d.albums.grantRole(d.albums.RELAYER_ROLE(), cfg.relayers[i]);
        }

        d.cards.setLimit(d.cards.LIMIT_MINT(), cfg.limitPerHour);
        d.cards.setLimit(d.cards.LIMIT_TRANSFER(), cfg.limitPerHour);
        d.cards.setLimit(d.cards.LIMIT_BURN(), cfg.limitPerHour);
        d.cards.setLimit(d.cards.LIMIT_REDEEM(), cfg.limitPerHour);
        d.store.setLimit(d.store.LIMIT_PURCHASE_CARDS(), cfg.limitPerHour);
        d.albums.setLimit(d.albums.LIMIT_WISH(), cfg.limitPerHour);
        d.albums.setLimit(d.albums.LIMIT_REWARD(), cfg.limitPerHour);

        if (cfg.attestor != address(0)) {
            d.store.setAttestor(cfg.attestor);
            d.albums.setAttestor(cfg.attestor);
        }
    }

    // ═══ 3. Handover ════════════════════════════════════════════════════════

    function handover(Deployment memory d, address deployer) internal {
        address timelock = address(d.timelock);
        d.timelock.renounceRole(DEFAULT_ADMIN_ROLE, deployer);
        d.cards.grantRole(DEFAULT_ADMIN_ROLE, timelock);
        d.store.grantRole(DEFAULT_ADMIN_ROLE, timelock);
        d.albums.grantRole(DEFAULT_ADMIN_ROLE, timelock);
        d.cards.renounceRole(DEFAULT_ADMIN_ROLE, deployer);
        d.store.renounceRole(DEFAULT_ADMIN_ROLE, deployer);
        d.albums.renounceRole(DEFAULT_ADMIN_ROLE, deployer);
    }

    // ═══ Check ══════════════════════════════════════════════════════════════

    function check(Deployment memory d, Expect memory e) internal view {
        address timelock = address(d.timelock);

        // Timelock: the Safe proposes, executes and cancels; nobody else administers it.
        require(d.timelock.getMinDelay() == e.timelockDelay, "timelock: wrong delay");
        require(d.timelock.hasRole(d.timelock.PROPOSER_ROLE(), e.safe), "timelock: Safe is not proposer");
        require(d.timelock.hasRole(d.timelock.EXECUTOR_ROLE(), e.safe), "timelock: Safe is not executor");
        require(d.timelock.hasRole(d.timelock.CANCELLER_ROLE(), e.safe), "timelock: Safe is not canceller");
        require(d.timelock.hasRole(d.timelock.CANCELLER_ROLE(), e.guardian), "timelock: Guardian is not canceller");
        require(!d.timelock.hasRole(d.timelock.PROPOSER_ROLE(), e.guardian), "timelock: Guardian must not propose");
        require(!d.timelock.hasRole(d.timelock.EXECUTOR_ROLE(), e.guardian), "timelock: Guardian must not execute");
        require(!d.timelock.hasRole(DEFAULT_ADMIN_ROLE, e.deployer), "timelock: deployer is admin");
        require(d.timelock.hasRole(DEFAULT_ADMIN_ROLE, timelock), "timelock: not self-administered");

        AccessControlEnumerable[3] memory all = [
            AccessControlEnumerable(address(d.cards)),
            AccessControlEnumerable(address(d.store)),
            AccessControlEnumerable(address(d.albums))
        ];
        for (uint256 i = 0; i < 3; i++) {
            _exactly(all[i], DEFAULT_ADMIN_ROLE, _one(timelock), "DEFAULT_ADMIN_ROLE must be exactly the timelock");
            _exactly(all[i], keccak256("GUARDIAN_ROLE"), _one(e.guardian), "GUARDIAN_ROLE must be exactly the guardian");
            _exactly(all[i], keccak256("UNPAUSER_ROLE"), _one(e.safe), "UNPAUSER_ROLE must be exactly the Safe");
            _exactly(all[i], keccak256("RELAYER_ROLE"), e.relayers, "RELAYER_ROLE must be exactly the relayers");
        }

        address[] memory minters = new address[](2);
        minters[0] = address(d.store);
        minters[1] = address(d.albums);
        _exactly(all[0], d.cards.MINTER_ROLE(), minters, "MINTER_ROLE must be exactly Store and Albums");
        _exactly(all[0], d.cards.STATUS_ROLE(), _one(address(d.albums)), "STATUS_ROLE must be exactly Albums");

        // The deployer and the v1 admin hold nothing.
        _holdsNothing(d, e.deployer, "deployer still holds a role");
        if (e.v1Admin != address(0)) _holdsNothing(d, e.v1Admin, "v1 admin holds a role in v2");

        // Wiring and parameters.
        require(address(d.store.entropy()) == e.entropy, "store: wrong entropy");
        require(address(d.store.cards()) == address(d.cards), "store: wrong ledger");
        require(address(d.albums.cards()) == address(d.cards), "albums: wrong ledger");
        require(d.store.attestor() == e.attestor, "store: wrong attestor");
        require(d.albums.attestor() == e.attestor, "albums: wrong attestor");
        require(d.cards.limitOf(d.cards.LIMIT_MINT()) > 0, "cards: mint limit unset");
        require(d.cards.limitOf(d.cards.LIMIT_TRANSFER()) > 0, "cards: transfer limit unset");
        require(d.cards.limitOf(d.cards.LIMIT_BURN()) > 0, "cards: burn limit unset");
        require(d.cards.limitOf(d.cards.LIMIT_REDEEM()) > 0, "cards: redeem limit unset");
        require(d.store.limitOf(d.store.LIMIT_PURCHASE_CARDS()) > 0, "store: purchase limit unset");
        require(d.albums.limitOf(d.albums.LIMIT_WISH()) > 0, "albums: wish limit unset");
        require(d.albums.limitOf(d.albums.LIMIT_REWARD()) > 0, "albums: reward limit unset");
        require(bytes(d.cards.uri(1)).length == 0, "cards: uri must stay empty (ADR-033)");
        require(!d.cards.paused() && !d.store.paused() && !d.albums.paused(), "a contract is paused");
    }

    // ═══ Internals ══════════════════════════════════════════════════════════

    function _checkConfig(Config memory cfg, address deployer) private view {
        require(cfg.safe != address(0) && cfg.guardian != address(0) && cfg.entropy != address(0), "config: zero address");
        require(cfg.guardian != cfg.safe, "config: guardian must not be the Safe");
        require(cfg.relayers.length >= 1, "config: no relayer");
        require(cfg.timelockDelay >= 1 days, "config: timelock delay under a day");
        require(cfg.limitPerHour > 0, "config: limit is zero");
        require(deployer != cfg.safe && deployer != cfg.guardian, "config: deployer must be a fresh key");
        if (cfg.requireSafeIsContract) require(cfg.safe.code.length > 0, "config: Safe address has no code");
        for (uint256 i = 0; i < cfg.relayers.length; i++) {
            address r = cfg.relayers[i];
            require(r != address(0), "config: zero relayer");
            require(r != cfg.safe && r != cfg.guardian && r != deployer, "config: relayer must be its own key");
            for (uint256 j = i + 1; j < cfg.relayers.length; j++) {
                require(r != cfg.relayers[j], "config: duplicate relayer");
            }
        }
    }

    function _exactly(AccessControlEnumerable c, bytes32 role, address[] memory expected, string memory message)
        private
        view
    {
        require(c.getRoleMemberCount(role) == expected.length, message);
        for (uint256 i = 0; i < expected.length; i++) {
            require(c.hasRole(role, expected[i]), message);
        }
    }

    function _holdsNothing(Deployment memory d, address account, string memory message) private view {
        bytes32[6] memory roles = [
            DEFAULT_ADMIN_ROLE,
            keccak256("GUARDIAN_ROLE"),
            keccak256("UNPAUSER_ROLE"),
            keccak256("RELAYER_ROLE"),
            keccak256("MINTER_ROLE"),
            keccak256("STATUS_ROLE")
        ];
        for (uint256 i = 0; i < roles.length; i++) {
            require(!d.cards.hasRole(roles[i], account), message);
            require(!d.store.hasRole(roles[i], account), message);
            require(!d.albums.hasRole(roles[i], account), message);
        }
        require(!d.timelock.hasRole(d.timelock.PROPOSER_ROLE(), account), message);
        require(!d.timelock.hasRole(d.timelock.EXECUTOR_ROLE(), account), message);
    }

    function _one(address a) private pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = a;
    }
}
