// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title SigLib
 * @notice Signature recovery that returns address(0) instead of reverting.
 *
 * This is deliberate. When a prompt-injected agent submits nonsense, the gate
 * must answer `REJECTED: BAD_SIGNATURE` as a result the caller can read and
 * act on. A revert would surface as a failed transaction instead, losing the
 * reason and making a refusal indistinguishable from an outage.
 */
library SigLib {
    function tryRecover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8 v;
        // only reads from the `sig` bytes array, writes nothing
        assembly ("memory-safe") {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }

        // Reject the upper half of the curve order, so one signature cannot be
        // malleated into a second distinct-looking one.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        if (v != 27 && v != 28) return address(0);

        return ecrecover(digest, v, r, s);
    }
}
