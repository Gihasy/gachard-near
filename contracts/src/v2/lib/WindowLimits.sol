// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title WindowLimits
 * @notice Per-hour limits, one bucket per action and per caller.
 * @dev A limit bounds what a leaked key can do before anyone notices; it is not
 *      there to cap the business (docs/CONTRACT-V2-SPEC.md §9).
 *      - Every limit starts at zero, so an action nobody configured is refused
 *        rather than unlimited.
 *      - The inheriting contract decides who may raise a limit (the timelock)
 *        and who may lower one (the Guardian, instantly).
 *      - Buckets are keyed by `msg.sender`, so each Relayer key and each module
 *        has its own share and a leaked key can only spend its own.
 */
abstract contract WindowLimits {
    uint256 public constant WINDOW = 1 hours;

    struct Usage {
        uint64 window;
        uint64 used;
    }

    /// @notice The most units one caller may use per window, per action.
    mapping(bytes32 action => uint64 max) public limitOf;
    mapping(bytes32 key => Usage) private _usage;

    event LimitSet(bytes32 indexed action, uint64 max);

    error LimitExceeded(bytes32 action, address account, uint256 requested, uint256 remaining);
    error LimitNotLower(bytes32 action, uint64 current, uint64 requested);

    /// @notice What `account` has used of `action` in the current window, and when the window ends.
    function usageOf(bytes32 action, address account)
        external
        view
        returns (uint64 used, uint64 max, uint256 windowEndsAt)
    {
        Usage memory u = _usage[_key(action, account)];
        // An hour index: fits in uint64 for billions of years.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 current = uint64(block.timestamp / WINDOW);
        used = u.window == current ? u.used : 0;
        max = limitOf[action];
        windowEndsAt = (uint256(current) + 1) * WINDOW;
    }

    function _setLimit(bytes32 action, uint64 max) internal {
        limitOf[action] = max;
        emit LimitSet(action, max);
    }

    function _lowerLimit(bytes32 action, uint64 max) internal {
        uint64 current = limitOf[action];
        if (max >= current) revert LimitNotLower(action, current, max);
        _setLimit(action, max);
    }

    function _consume(bytes32 action, address account, uint256 amount) internal {
        bytes32 key = _key(action, account);
        Usage memory u = _usage[key];
        // An hour index: fits in uint64 for billions of years.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 current = uint64(block.timestamp / WINDOW);
        if (u.window != current) {
            u.window = current;
            u.used = 0;
        }
        uint256 max = limitOf[action];
        uint256 remaining = u.used >= max ? 0 : max - u.used;
        if (amount > remaining) revert LimitExceeded(action, account, amount, remaining);
        // amount <= remaining <= max, and max is a uint64.
        // forge-lint: disable-next-line(unsafe-typecast)
        u.used += uint64(amount);
        _usage[key] = u;
    }

    function _key(bytes32 action, address account) private pure returns (bytes32) {
        return keccak256(abi.encode(action, account));
    }
}
