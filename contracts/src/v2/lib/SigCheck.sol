// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/**
 * @title SigCheck
 * @notice Accepts an ECDSA signature first, then falls back to ERC-1271.
 * @dev OpenZeppelin 5.6.1's `SignatureChecker.isValidSignatureNow` tries only
 *      ERC-1271 when the signer has code. Privy's sponsored wallets carry
 *      EIP-7702 delegation code (ADR-031), so that function would reject every
 *      self-custody user's plain signature. Accepting ECDSA first is safe: a
 *      contract wallet has no private key that could produce its address.
 *      See docs/CONTRACT-V2-SPEC.md §6.
 */
library SigCheck {
    function isValidNow(address signer, bytes32 digest, bytes memory signature) internal view returns (bool) {
        if (signer == address(0)) return false;
        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signature);
        if (err == ECDSA.RecoverError.NoError && recovered == signer) return true;
        if (signer.code.length == 0) return false;
        return SignatureChecker.isValidERC1271SignatureNow(signer, digest, signature);
    }
}
