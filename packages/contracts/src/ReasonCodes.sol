// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title ReasonCodes
 * @notice The bitmask shared with `@zowall/gate-core/src/codes.ts`.
 *
 * Bit index equals the index in that file's REASON_CODES array, and the list
 * is append-only: reordering an entry silently reinterprets every reasonMask
 * ever written to the Hedera journal.
 *
 * The ordering is not arbitrary. Every hard code sits in the low byte, so
 * severity is a mask test rather than a lookup table, and adding a soft code
 * can never accidentally make an invoice rejectable.
 */
library ReasonCodes {
    uint32 internal constant NO_PO = 1 << 0;
    uint32 internal constant BAD_SIGNATURE = 1 << 1;
    uint32 internal constant PAYEE_MISMATCH = 1 << 2;
    uint32 internal constant PO_EXPIRED = 1 << 3;
    uint32 internal constant PO_CLOSED = 1 << 4;
    uint32 internal constant DUPLICATE_INVOICE = 1 << 5;
    uint32 internal constant BUDGET_EXCEEDED = 1 << 6;
    uint32 internal constant SOD_VIOLATION = 1 << 7;

    uint32 internal constant NO_RECEIPT = 1 << 8;
    uint32 internal constant QTY_OVER_RECEIVED = 1 << 9;
    uint32 internal constant PRICE_OVER_TOLERANCE = 1 << 10;

    /// @dev Nothing parks, no human may override.
    uint32 internal constant HARD_MASK = 0x00FF;
    /// @dev Funds stay encumbered, a different human may release it.
    uint32 internal constant SOFT_MASK = 0x0700;

    function isHard(uint32 mask) internal pure returns (bool) {
        return mask & HARD_MASK != 0;
    }

    function isSoft(uint32 mask) internal pure returns (bool) {
        return mask & SOFT_MASK != 0;
    }
}
