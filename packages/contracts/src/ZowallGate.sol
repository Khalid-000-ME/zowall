// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "./interfaces/IERC20.sol";
import {MatchEngine} from "./MatchEngine.sol";
import {ReasonCodes} from "./ReasonCodes.sol";
import {SigLib} from "./SigLib.sol";

/**
 * @title ZowallGate
 * @notice Finance never pays an invoice that does not match the purchase
 *         order. This contract is the ledger that disposes.
 *
 * A language model never decides whether money moves. It parses documents and
 * proposes; `submitInvoice` disposes, deterministically, and publishes every
 * reason it refused.
 *
 * Amounts are USDT base units. Whitechain Sepolia USDT is 6 decimals - never
 * assume 18 anywhere in this file.
 */
contract ZowallGate {
    using SigLib for bytes32;

    /* ------------------------------------------------------------ types -- */

    enum Role {
        Creator,
        Receiver,
        Approver
    }

    struct PurchaseOrder {
        address vendor;
        address payee;
        bytes32 specHash;
        uint128 qty;
        uint128 unitPrice;
        uint16 priceTolBps;
        uint16 qtyTolBps;
        uint64 expiry;
        uint128 received;
        uint128 invoicedQty;
        uint256 invoicedValue;
        /// @dev reservation still held against this PO, in USDT base units
        uint256 encumbered;
        bytes32 creatorPersonId;
        /// @dev personId of the most recent receiver, for segregation of duties
        bytes32 receiverPersonId;
        MatchEngine.POStatus status;
    }

    struct POInput {
        address vendor;
        address payee;
        bytes32 specHash;
        uint128 qty;
        uint128 unitPrice;
        uint16 priceTolBps;
        uint16 qtyTolBps;
        uint64 expiry;
    }

    struct Invoice {
        uint256 poId;
        address vendor;
        address payee;
        uint128 qty;
        uint128 unitPrice;
        bytes32 invoiceHash;
        uint256 nonce;
        uint64 deadline;
    }

    /// @dev Issued by the backend only after a World ID proof verifies
    ///      server-side. The browser never receives anything it could forge a
    ///      verified result from.
    struct Attestation {
        bytes32 personId;
        uint8 role;
        uint64 expiry;
        uint256 poId;
        /// @dev Makes two attestations for the same person, role and PO
        ///      distinct, so one human can raise two POs in a single block.
        uint256 nonce;
        bytes sig;
    }

    struct Hold {
        uint256 poId;
        bytes32 invoiceHash;
        uint32 reasonMask;
        uint64 createdAt;
        bytes32 resolvedBy;
        bool resolved;
        // the invoice as submitted, so a retry re-evaluates the same document
        address payee;
        uint128 qty;
        uint128 unitPrice;
        uint256 nonce;
        uint64 deadline;
    }

    /* ---------------------------------------------------------- storage -- */

    IERC20 public immutable usdt;
    /// @notice Backend key that signs role attestations after World ID verify.
    address public immutable attestor;
    bytes32 public immutable domainSeparator;

    uint256 public nextPoId = 1;
    uint256 public nextHoldId = 1;
    /// @notice Sum of every live reservation. Balance must always cover it.
    uint256 public totalEncumbered;

    mapping(uint256 => PurchaseOrder) private _pos;
    mapping(uint256 => Hold) private _holds;
    mapping(bytes32 => bool) public invoiceSeen;
    mapping(bytes32 => bool) public attestationUsed;

    /* ----------------------------------------------------------- events -- */

    event POCreated(
        uint256 indexed poId,
        address indexed vendor,
        address indexed payee,
        uint128 qty,
        uint128 unitPrice,
        uint256 encumbered,
        bytes32 creatorPersonId,
        bytes32 journalDigest
    );

    event POCancelled(uint256 indexed poId, uint256 released, bytes32 journalDigest);

    event ReceiptAttested(
        uint256 indexed poId,
        uint128 qty,
        uint128 totalReceived,
        bytes32 deliverableHash,
        bytes32 receiverPersonId,
        bytes32 journalDigest
    );

    /// @notice Emitted for every decision, including the refusals. The
    ///         journalDigest binds this log to the Hedera journal entry.
    event Decision(
        uint256 indexed poId,
        bytes32 invoiceHash,
        MatchEngine.Outcome outcome,
        uint32 reasonMask,
        uint256 paid,
        uint256 holdId,
        bytes32 journalDigest
    );

    event HoldResolved(
        uint256 indexed holdId,
        uint256 indexed poId,
        bool approved,
        bytes32 approverPersonId,
        uint256 paid,
        /// @dev Extra reservation the override had to draw from free balance.
        ///      Non-zero means a human knowingly committed more than the PO
        ///      originally reserved, and that is on the record.
        uint256 amended,
        bytes32 journalDigest
    );

    /* ----------------------------------------------------------- errors -- */

    error NotEnoughBalanceToEncumber(uint256 needed, uint256 available);
    error PONotOpen(uint256 poId);
    error BadAttestation();
    error AttestationExpired();
    error AttestationReplayed();
    error WrongRole(uint8 expected, uint8 got);
    error AttestationPOMismatch(uint256 expected, uint256 got);
    /// @dev Segregation of duties. The whole point of the control.
    error SodViolation(bytes32 personId);
    /// @dev Only the human who raised a purchase order may cancel it.
    error NotPOCreator(bytes32 personId);
    error HoldNotFound(uint256 holdId);
    error HoldAlreadyResolved(uint256 holdId);
    error ExceedsEncumbrance(uint256 requested, uint256 remaining);
    error ZeroQuantity();
    error TransferFailed();

    /* ------------------------------------------------------------- init -- */

    constructor(IERC20 _usdt, address _attestor) {
        usdt = _usdt;
        attestor = _attestor;
        domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Zowall"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /* -------------------------------------------------------- PO lifecycle */

    /// @notice Raise a purchase order and reserve its total against the vault.
    function createPO(POInput calldata po, Attestation calldata a) external returns (uint256 poId) {
        if (po.qty == 0) revert ZeroQuantity();
        _useAttestation(a, Role.Creator, 0);

        // Reserve the tolerance ceiling, not the headline total. A 5%
        // tolerance means an invoice at 42 is legitimate, and a reservation of
        // only 40 would refuse to settle an invoice the rules just approved.
        uint256 total = MatchEngine.withTolerance(uint256(po.qty) * uint256(po.unitPrice), po.priceTolBps);
        uint256 balance = usdt.balanceOf(address(this));
        if (balance < totalEncumbered + total) {
            revert NotEnoughBalanceToEncumber(totalEncumbered + total, balance);
        }

        poId = nextPoId++;
        totalEncumbered += total;

        PurchaseOrder storage p = _pos[poId];
        p.vendor = po.vendor;
        p.payee = po.payee;
        p.specHash = po.specHash;
        p.qty = po.qty;
        p.unitPrice = po.unitPrice;
        p.priceTolBps = po.priceTolBps;
        p.qtyTolBps = po.qtyTolBps;
        p.expiry = po.expiry;
        p.encumbered = total;
        p.creatorPersonId = a.personId;
        p.status = MatchEngine.POStatus.Open;

        emit POCreated(
            poId,
            po.vendor,
            po.payee,
            po.qty,
            po.unitPrice,
            total,
            a.personId,
            _digest(poId, bytes32(0), MatchEngine.Outcome.Paid, 0, p, 0, 0, bytes32(0), 0)
        );
    }

    /**
     * @notice Cancel a PO and release whatever is still reserved.
     *
     * Requires a fresh Creator attestation from the same human who raised it.
     * Without that check anyone could cancel anyone's purchase order: the
     * money would stay in the vault, so it is not theft, but a vendor could no
     * longer rely on a reservation still being there when they ship - which is
     * the one thing this contract exists to promise them.
     */
    function cancelPO(uint256 poId, Attestation calldata a) external {
        PurchaseOrder storage p = _pos[poId];
        if (p.status != MatchEngine.POStatus.Open) revert PONotOpen(poId);

        _useAttestation(a, Role.Creator, poId);
        if (a.personId != p.creatorPersonId) revert NotPOCreator(a.personId);

        uint256 released = p.encumbered;
        p.encumbered = 0;
        totalEncumbered -= released;
        p.status = MatchEngine.POStatus.Cancelled;

        emit POCancelled(
            poId, released, _digest(poId, bytes32(0), MatchEngine.Outcome.Rejected, 0, p, 0, 0, bytes32(0), 0)
        );
    }

    /**
     * @notice Record goods as received. Gated on a fresh human check, and the
     *         receiver must not be the person who raised the PO.
     */
    function attestReceipt(uint256 poId, uint128 qty, bytes32 deliverableHash, Attestation calldata a) external {
        PurchaseOrder storage p = _pos[poId];
        if (p.status != MatchEngine.POStatus.Open) revert PONotOpen(poId);
        if (qty == 0) revert ZeroQuantity();
        _useAttestation(a, Role.Receiver, poId);

        if (a.personId == p.creatorPersonId) revert SodViolation(a.personId);

        p.received += qty;
        p.receiverPersonId = a.personId;

        emit ReceiptAttested(
            poId,
            qty,
            p.received,
            deliverableHash,
            a.personId,
            _digest(poId, deliverableHash, MatchEngine.Outcome.Paid, 0, p, 0, 0, bytes32(0), 0)
        );
    }

    /* ---------------------------------------------------------- the gate -- */

    /**
     * @notice Submit a vendor-signed invoice. Anyone may relay it; the
     *         signature is what authorises, not the sender.
     * @return outcome Paid, Held or Rejected. Never reverts on a bad document -
     *         a refusal is a result, and the demo depends on it being visible.
     */
    function submitInvoice(Invoice calldata inv, bytes calldata vendorSig)
        external
        returns (MatchEngine.Outcome outcome)
    {
        PurchaseOrder storage p = _pos[inv.poId];
        address signer = _invoiceDigest(inv).tryRecover(vendorSig);

        (uint32 mask, MatchEngine.Outcome o) = _evaluate(p, inv, signer, bytes32(0), true);
        outcome = o;

        // A duplicate is recorded on first sight, so the second submission of
        // the same document is refused even if it would otherwise pay.
        invoiceSeen[inv.invoiceHash] = true;

        uint256 paid;
        uint256 holdId;

        if (o == MatchEngine.Outcome.Paid) {
            paid = _settle(p, inv.payee, inv.qty, inv.unitPrice);
        } else if (o == MatchEngine.Outcome.Held) {
            holdId = nextHoldId++;
            _holds[holdId] = Hold({
                poId: inv.poId,
                invoiceHash: inv.invoiceHash,
                reasonMask: mask,
                createdAt: uint64(block.timestamp),
                resolvedBy: bytes32(0),
                resolved: false,
                payee: inv.payee,
                qty: inv.qty,
                unitPrice: inv.unitPrice,
                nonce: inv.nonce,
                deadline: inv.deadline
            });
        }

        emit Decision(
            inv.poId,
            inv.invoiceHash,
            o,
            mask,
            paid,
            holdId,
            _digest(inv.poId, inv.invoiceHash, o, mask, p, inv.qty, inv.unitPrice, bytes32(0), inv.nonce)
        );
    }

    /**
     * @notice Release or refuse a held invoice. The approver must be a third
     *         human: not the PO creator, not the receiver.
     */
    function resolveHold(uint256 holdId, bool approve, Attestation calldata a) external {
        Hold storage h = _holds[holdId];
        if (h.createdAt == 0) revert HoldNotFound(holdId);
        if (h.resolved) revert HoldAlreadyResolved(holdId);

        PurchaseOrder storage p = _pos[h.poId];
        _useAttestation(a, Role.Approver, h.poId);

        if (a.personId == p.creatorPersonId || a.personId == p.receiverPersonId) {
            revert SodViolation(a.personId);
        }

        h.resolved = true;
        h.resolvedBy = a.personId;

        uint256 paid;
        uint256 amended;
        if (approve) {
            // A variance that a third human accepts is a purchase order
            // amendment, so the shortfall is drawn from free balance and
            // recorded. It can never come out of another PO's reservation,
            // which is the invariant that actually matters here.
            amended = _amend(p, uint256(h.qty) * uint256(h.unitPrice));
            paid = _settle(p, h.payee, h.qty, h.unitPrice);
        }

        emit HoldResolved(
            holdId,
            h.poId,
            approve,
            a.personId,
            paid,
            amended,
            _digest(
                h.poId,
                h.invoiceHash,
                approve ? MatchEngine.Outcome.Paid : MatchEngine.Outcome.Rejected,
                h.reasonMask,
                p,
                h.qty,
                h.unitPrice,
                a.personId,
                h.nonce
            )
        );
    }

    /**
     * @notice Re-evaluate a hold with no human involved. Permissionless by
     *         design: an invoice held only because nothing had arrived yet
     *         becomes payable the moment a receipt lands, and nobody should
     *         have to be awake for that.
     */
    function retry(uint256 holdId) external returns (MatchEngine.Outcome outcome) {
        Hold storage h = _holds[holdId];
        if (h.createdAt == 0) revert HoldNotFound(holdId);
        if (h.resolved) revert HoldAlreadyResolved(holdId);

        PurchaseOrder storage p = _pos[h.poId];
        Invoice memory inv = Invoice({
            poId: h.poId,
            vendor: p.vendor,
            payee: h.payee,
            qty: h.qty,
            unitPrice: h.unitPrice,
            invoiceHash: h.invoiceHash,
            nonce: h.nonce,
            deadline: h.deadline
        });

        // The signature was already checked when the hold was created, and the
        // stored document is the one that was signed, so the vendor key is
        // taken as given here rather than re-recovered. The duplicate check is
        // skipped too: this invoice IS the held one, and it was marked seen the
        // moment it first arrived.
        (uint32 mask, MatchEngine.Outcome o) = _evaluate(p, inv, p.vendor, bytes32(0), false);
        outcome = o;

        uint256 paid;
        if (o == MatchEngine.Outcome.Paid) {
            h.resolved = true;
            paid = _settle(p, h.payee, h.qty, h.unitPrice);
        } else {
            h.reasonMask = mask;
        }

        emit Decision(
            h.poId,
            h.invoiceHash,
            o,
            mask,
            paid,
            holdId,
            _digest(h.poId, h.invoiceHash, o, mask, p, h.qty, h.unitPrice, bytes32(0), h.nonce)
        );
    }

    /* ------------------------------------------------------------- views -- */

    function getPO(uint256 poId) external view returns (PurchaseOrder memory) {
        return _pos[poId];
    }

    function getHold(uint256 holdId) external view returns (Hold memory) {
        return _holds[holdId];
    }

    /// @notice What the gate would decide, without changing anything. The x402
    ///         endpoint and the UI preview both read this.
    function previewInvoice(Invoice calldata inv, bytes calldata vendorSig)
        external
        view
        returns (uint32 reasonMask, MatchEngine.Outcome outcome)
    {
        PurchaseOrder storage p = _pos[inv.poId];
        address signer = _invoiceDigest(inv).tryRecover(vendorSig);
        return _evaluate(p, inv, signer, bytes32(0), true);
    }

    /// @notice Balance beyond every live reservation. Free to withdraw.
    function unencumberedBalance() external view returns (uint256) {
        uint256 balance = usdt.balanceOf(address(this));
        return balance > totalEncumbered ? balance - totalEncumbered : 0;
    }

    /* --------------------------------------------------------- internals -- */

    function _evaluate(
        PurchaseOrder storage p,
        Invoice memory inv,
        address signer,
        bytes32 approverPersonId,
        bool checkDuplicate
    ) private view returns (uint32 mask, MatchEngine.Outcome outcome) {
        MatchEngine.Ctx memory c = MatchEngine.Ctx({
            poExists: p.status != MatchEngine.POStatus.None,
            poStatus: p.status,
            poVendor: p.vendor,
            poPayee: p.payee,
            poQty: p.qty,
            poUnitPrice: p.unitPrice,
            priceTolBps: p.priceTolBps,
            qtyTolBps: p.qtyTolBps,
            poExpiry: p.expiry,
            received: p.received,
            invoicedQty: p.invoicedQty,
            invoicedValue: p.invoicedValue,
            recoveredSigner: signer,
            invPayee: inv.payee,
            invQty: inv.qty,
            invUnitPrice: inv.unitPrice,
            invDeadline: inv.deadline,
            alreadySeen: checkDuplicate && invoiceSeen[inv.invoiceHash],
            creatorPersonId: p.creatorPersonId,
            receiverPersonId: p.receiverPersonId,
            approverPersonId: approverPersonId,
            at: uint64(block.timestamp)
        });
        return MatchEngine.evaluate(c);
    }

    function _settle(PurchaseOrder storage p, address payee, uint128 qty, uint128 unitPrice)
        private
        returns (uint256 amount)
    {
        amount = uint256(qty) * uint256(unitPrice);
        if (amount > p.encumbered) revert ExceedsEncumbrance(amount, p.encumbered);

        p.encumbered -= amount;
        totalEncumbered -= amount;
        p.invoicedQty += qty;
        p.invoicedValue += amount;

        if (p.invoicedQty >= p.qty) {
            // Fully invoiced. Release any dust left by under-priced invoices.
            uint256 dust = p.encumbered;
            if (dust > 0) {
                p.encumbered = 0;
                totalEncumbered -= dust;
            }
            p.status = MatchEngine.POStatus.Closed;
        }

        if (!usdt.transfer(payee, amount)) revert TransferFailed();
    }

    /**
     * @dev Raise this PO's reservation to cover `needed`, taking the shortfall
     *      from balance that no other PO has reserved. Reverts rather than
     *      borrowing, so an override on one purchase order can never spend
     *      another one's encumbered funds.
     */
    function _amend(PurchaseOrder storage p, uint256 needed) private returns (uint256 extra) {
        if (needed <= p.encumbered) return 0;
        extra = needed - p.encumbered;

        uint256 balance = usdt.balanceOf(address(this));
        uint256 free = balance > totalEncumbered ? balance - totalEncumbered : 0;
        if (extra > free) revert ExceedsEncumbrance(needed, p.encumbered + free);

        p.encumbered += extra;
        totalEncumbered += extra;
    }

    /// @dev Verifies a role attestation and burns it, so one proof authorises
    ///      one action.
    function _useAttestation(Attestation calldata a, Role role, uint256 poId) private {
        if (a.role != uint8(role)) revert WrongRole(uint8(role), a.role);
        if (block.timestamp > a.expiry) revert AttestationExpired();
        if (poId != 0 && a.poId != poId) revert AttestationPOMismatch(poId, a.poId);

        bytes32 digest = _attestationDigest(a);
        if (attestationUsed[digest]) revert AttestationReplayed();
        if (digest.tryRecover(a.sig) != attestor) revert BadAttestation();
        attestationUsed[digest] = true;
    }

    bytes32 private constant INVOICE_TYPEHASH = keccak256(
        "Invoice(uint256 poId,address vendor,address payee,uint128 qty,uint128 unitPrice,bytes32 invoiceHash,uint256 nonce,uint64 deadline)"
    );

    bytes32 private constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(bytes32 personId,uint8 role,uint64 expiry,uint256 poId,uint256 nonce)");

    function _invoiceDigest(Invoice memory inv) private view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator,
                keccak256(
                    abi.encode(
                        INVOICE_TYPEHASH,
                        inv.poId,
                        inv.vendor,
                        inv.payee,
                        inv.qty,
                        inv.unitPrice,
                        inv.invoiceHash,
                        inv.nonce,
                        inv.deadline
                    )
                )
            )
        );
    }

    function _attestationDigest(Attestation calldata a) private view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator,
                keccak256(abi.encode(ATTESTATION_TYPEHASH, a.personId, a.role, a.expiry, a.poId, a.nonce))
            )
        );
    }

    /**
     * @dev The cross-chain binding. Fourteen static words, byte-identical to
     *      `encodeDecision` in gate-core, so `journal replay` can
     *      recompute this from the event log and assert it equals the digest
     *      on the Hedera topic.
     */
    function _digest(
        uint256 poId,
        bytes32 invoiceHash,
        MatchEngine.Outcome outcome,
        uint32 reasonMask,
        PurchaseOrder storage p,
        uint128 invQty,
        uint128 invUnitPrice,
        bytes32 approverPersonId,
        uint256 nonce
    ) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                address(this),
                poId,
                invoiceHash,
                uint8(outcome),
                reasonMask,
                invQty,
                p.received,
                invUnitPrice,
                p.unitPrice,
                p.creatorPersonId,
                p.receiverPersonId,
                approverPersonId,
                nonce
            )
        );
    }
}
