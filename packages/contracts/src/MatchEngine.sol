// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReasonCodes} from "./ReasonCodes.sol";

/**
 * @title MatchEngine
 * @notice The on-chain half of `@zowall/gate-core`. Pure, no storage, no
 *         external calls, no clock of its own - `at` is passed in so this
 *         library and the TypeScript engine can be given identical input and
 *         compared.
 *
 * Rule for rule, suppression for suppression, this must stay in step with
 * `packages/gate-core/src/rules.ts`. The acceptance tests in both places use
 * the same numbers and the same names so a divergence fails twice.
 */
library MatchEngine {
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    enum Outcome {
        Paid,
        Held,
        Rejected
    }

    enum POStatus {
        None,
        Open,
        Closed,
        Cancelled
    }

    /// @dev Flattened evaluation input. Mirrors EvalContext in gate-core.
    struct Ctx {
        bool poExists;
        POStatus poStatus;
        address poVendor;
        address poPayee;
        uint128 poQty;
        uint128 poUnitPrice;
        uint16 priceTolBps;
        uint16 qtyTolBps;
        uint64 poExpiry;
        uint128 received;
        uint128 invoicedQty;
        uint256 invoicedValue;
        address recoveredSigner;
        address invPayee;
        uint128 invQty;
        uint128 invUnitPrice;
        uint64 invDeadline;
        bool alreadySeen;
        bytes32 creatorPersonId;
        bytes32 receiverPersonId;
        bytes32 approverPersonId;
        uint64 at;
    }

    /// @notice The highest value still inside tolerance. Floors, so a
    ///         tolerance never quietly widens itself.
    function withTolerance(uint256 base, uint16 bps) internal pure returns (uint256) {
        return base + (base * bps) / BPS_DENOMINATOR;
    }

    /// @notice Every failing code, not just the first.
    function reasons(Ctx memory c) internal pure returns (uint32 mask) {
        // --- hard -------------------------------------------------------
        if (!c.poExists || c.poStatus == POStatus.Cancelled) {
            // Nothing was ever ordered. Every other rule needs a PO to read,
            // so return immediately rather than guarding each one.
            mask |= ReasonCodes.NO_PO;
            if (c.alreadySeen) mask |= ReasonCodes.DUPLICATE_INVOICE;
            mask |= _sod(c);
            return mask;
        }

        if (c.recoveredSigner == address(0) || c.recoveredSigner != c.poVendor) {
            mask |= ReasonCodes.BAD_SIGNATURE;
        } else if (c.invDeadline != 0 && c.at > c.invDeadline) {
            // No valid, in-date authorisation from the party named on the PO.
            mask |= ReasonCodes.BAD_SIGNATURE;
        }

        if (c.invPayee != c.poPayee) mask |= ReasonCodes.PAYEE_MISMATCH;
        if (c.poExpiry != 0 && c.at > c.poExpiry) mask |= ReasonCodes.PO_EXPIRED;
        if (c.poStatus == POStatus.Closed || c.invoicedQty >= c.poQty) {
            mask |= ReasonCodes.PO_CLOSED;
        }
        if (c.alreadySeen) mask |= ReasonCodes.DUPLICATE_INVOICE;
        mask |= _sod(c);

        // --- soft -------------------------------------------------------
        bool qtyOver = _qtyOverReceived(c);
        if (c.received == 0) {
            // NO_RECEIPT already says nothing arrived; one fact, one code.
            mask |= ReasonCodes.NO_RECEIPT;
        } else if (qtyOver) {
            mask |= ReasonCodes.QTY_OVER_RECEIVED;
        }

        // A quantity variance explains a budget overshoot and is reviewable by
        // a human, so it parks rather than hard-rejecting. Without this, an
        // over-quantity invoice could never reach the exception queue.
        if (!qtyOver && c.received != 0) {
            uint256 poTotal = uint256(c.poQty) * uint256(c.poUnitPrice);
            uint256 incoming = uint256(c.invQty) * uint256(c.poUnitPrice);
            if (c.invoicedValue + incoming > poTotal) mask |= ReasonCodes.BUDGET_EXCEEDED;
        }

        if (uint256(c.invUnitPrice) > withTolerance(c.poUnitPrice, c.priceTolBps)) {
            mask |= ReasonCodes.PRICE_OVER_TOLERANCE;
        }
    }

    function outcomeOf(uint32 mask) internal pure returns (Outcome) {
        if (ReasonCodes.isHard(mask)) return Outcome.Rejected;
        if (mask != 0) return Outcome.Held;
        return Outcome.Paid;
    }

    function evaluate(Ctx memory c) internal pure returns (uint32 mask, Outcome outcome) {
        mask = reasons(c);
        outcome = outcomeOf(mask);
    }

    /// @dev Compares stable enrollment personIds. A per-event World ID
    ///      nullifier is scoped to one action and cannot be compared across
    ///      roles, so it is never what reaches this function.
    function _sod(Ctx memory c) private pure returns (uint32) {
        bytes32 a = c.creatorPersonId;
        bytes32 b = c.receiverPersonId;
        bytes32 d = c.approverPersonId;
        bool clash = (a != bytes32(0) && a == b) || (a != bytes32(0) && a == d)
            || (b != bytes32(0) && b == d);
        return clash ? ReasonCodes.SOD_VIOLATION : 0;
    }

    function _qtyOverReceived(Ctx memory c) private pure returns (bool) {
        if (c.received == 0) return false;
        uint256 ceiling = withTolerance(c.received, c.qtyTolBps);
        uint256 available = ceiling > c.invoicedQty ? ceiling - c.invoicedQty : 0;
        return uint256(c.invQty) > available;
    }
}
