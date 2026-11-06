// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MockUSDT} from "./MockUSDT.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MatchEngine} from "../src/MatchEngine.sol";
import {ZowallGate} from "../src/ZowallGate.sol";

/**
 * An attestation authorises one person in one role. If it does not also commit
 * to WHAT that person is doing, it is a bearer token for the role: anyone who
 * sees it in the mempool can attach different arguments and spend it first.
 *
 * These tests are the attack, written from the position of a stranger who can
 * read pending transactions and has no key of any kind.
 */
contract FrontrunTest is Test {
    MockUSDT usdt;
    ZowallGate gate;

    uint256 constant ATTESTOR_PK = 0xA77E5705;
    uint256 constant VENDOR_PK = 0x7E4D0012;

    address attestor;
    address vendor;
    address payee = address(0xBEEF);
    address stranger = address(0x57A9);

    bytes32 constant ALICE = bytes32(uint256(0xA11CE));
    bytes32 constant BOB = bytes32(uint256(0xB0B));
    bytes32 constant CARA = bytes32(uint256(0xCA7A));

    uint256 attestNonce;

    function setUp() public {
        attestor = vm.addr(ATTESTOR_PK);
        vendor = vm.addr(VENDOR_PK);
        usdt = new MockUSDT();
        address[] memory set = new address[](1);
        set[0] = attestor;
        gate = new ZowallGate(IERC20(address(usdt)), set, 1);
        usdt.mint(address(gate), 10_000_000_000);
        vm.warp(1_800_000_000);
    }

    /* ------------------------------------------------------------ the PO -- */

    /// What Alice meant to raise: her vendor, her payee, 100 units at 40.
    function _intended() private view returns (ZowallGate.POInput memory) {
        return ZowallGate.POInput({
            vendor: vendor,
            payee: payee,
            specHash: keccak256("100 monitors"),
            qty: 100,
            unitPrice: 40_000_000,
            priceTolBps: 500,
            qtyTolBps: 0,
            expiry: uint64(block.timestamp + 86_400)
        });
    }

    /// Alice's order, as the attacker would rewrite it in flight.
    function _hijacked() private view returns (ZowallGate.POInput memory po) {
        po = _intended();
        po.vendor = stranger; // the attacker is the vendor now
        po.payee = stranger; // and gets paid
        po.qty = 1;
    }

    function test_createPO_attestationCannotBeReusedForDifferentTerms() public {
        // Alice's attestation, as it sits in the mempool.
        ZowallGate.Attestation memory aliceAtt = _attest(ALICE, ZowallGate.Role.Creator, 0, _createHash(_intended()));

        // The stranger copies it onto their own terms and lands first.
        vm.prank(stranger);
        vm.expectRevert();
        gate.createPO(_hijacked(), aliceAtt);

        // Alice's real transaction is unaffected.
        vm.prank(address(0xA11CE));
        uint256 poId = gate.createPO(_intended(), aliceAtt);
        assertEq(gate.getPO(poId).payee, payee, "the order Alice meant to raise");
    }

    /* ---------------------------------------------------------- the receipt -- */

    function _openPO() private returns (uint256) {
        return gate.createPO(_intended(), _attest(ALICE, ZowallGate.Role.Creator, 0, _createHash(_intended())));
    }

    function test_attestReceipt_attestationCannotBeReusedForADifferentQuantity() public {
        uint256 poId = _openPO();

        // Bob signs for 10 units. A stranger sees it and wants 100 recorded.
        bytes32 deliverable = keccak256("10 monitors");
        ZowallGate.Attestation memory bobAtt =
            _attest(BOB, ZowallGate.Role.Receiver, poId, _receiptHash(poId, 10, deliverable));

        vm.prank(stranger);
        vm.expectRevert();
        gate.attestReceipt(poId, 100, deliverable, bobAtt);

        gate.attestReceipt(poId, 10, deliverable, bobAtt);
        assertEq(gate.getPO(poId).received, 10, "only what Bob signed for");
    }

    /* ------------------------------------------------------------ the hold -- */

    function test_resolveHold_attestationCannotFlipTheDecision() public {
        uint256 poId = _openPO();
        gate.attestReceipt(
            poId, 100, keccak256("d"), _attest(BOB, ZowallGate.Role.Receiver, poId, _receiptHash(poId, 100, keccak256("d")))
        );

        // An invoice 15% over price: held for a third person.
        ZowallGate.Invoice memory inv = _invoice(poId, 100, 46_000_000);
        gate.submitInvoice(inv, _signInvoice(inv));
        uint256 holdId = 1;

        // Cara decides to REFUSE. A stranger copies her attestation and APPROVES.
        ZowallGate.Attestation memory caraRefuses =
            _attest(CARA, ZowallGate.Role.Approver, poId, _holdHash(holdId, false));

        vm.prank(stranger);
        vm.expectRevert();
        gate.resolveHold(holdId, true, caraRefuses);

        gate.resolveHold(holdId, false, caraRefuses);
        assertEq(usdt.balanceOf(payee), 0, "Cara refused, and nothing was paid");
    }

    /* --------------------------------------------------------------- cancel -- */

    function test_cancelPO_attestationIsForThatOrderOnly() public {
        uint256 poId = _openPO();
        uint256 other = gate.createPO(_intended(), _attest(ALICE, ZowallGate.Role.Creator, 0, _createHash(_intended())));

        ZowallGate.Attestation memory att = _attest(ALICE, ZowallGate.Role.Creator, poId, _cancelHash(poId));

        vm.prank(stranger);
        vm.expectRevert();
        gate.cancelPO(other, att);

        gate.cancelPO(poId, att);
    }

    /* ---------------------------------------------------------------- helpers -- */

    function _createHash(ZowallGate.POInput memory po) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("CreatePO"),
                po.vendor,
                po.payee,
                po.specHash,
                po.qty,
                po.unitPrice,
                po.priceTolBps,
                po.qtyTolBps,
                po.expiry
            )
        );
    }

    function _receiptHash(uint256 poId, uint128 qty, bytes32 deliverable) private pure returns (bytes32) {
        return keccak256(abi.encode(keccak256("AttestReceipt"), poId, qty, deliverable));
    }

    function _holdHash(uint256 holdId, bool approve) private pure returns (bytes32) {
        return keccak256(abi.encode(keccak256("ResolveHold"), holdId, approve));
    }

    function _cancelHash(uint256 poId) private pure returns (bytes32) {
        return keccak256(abi.encode(keccak256("CancelPO"), poId));
    }

    function _attest(bytes32 personId, ZowallGate.Role role, uint256 poId, bytes32 actionHash)
        private
        returns (ZowallGate.Attestation memory a)
    {
        a = ZowallGate.Attestation({
            personId: personId,
            role: uint8(role),
            expiry: uint64(block.timestamp + 600),
            poId: poId,
            actionHash: actionHash,
            nonce: ++attestNonce,
            sig: ""
        });
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Attestation(bytes32 personId,uint8 role,uint64 expiry,uint256 poId,bytes32 actionHash,uint256 nonce)"
                ),
                a.personId,
                a.role,
                a.expiry,
                a.poId,
                a.actionHash,
                a.nonce
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTOR_PK, _typed(structHash));
        a.sig = abi.encodePacked(r, s, v);
    }

    function _typed(bytes32 structHash) private view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", gate.domainSeparator(), structHash));
    }

    function _invoice(uint256 poId, uint128 qty, uint128 unit) private view returns (ZowallGate.Invoice memory) {
        return ZowallGate.Invoice({
            poId: poId,
            vendor: vendor,
            payee: payee,
            qty: qty,
            unitPrice: unit,
            invoiceHash: keccak256(abi.encode(poId, qty, unit)),
            nonce: 1,
            deadline: uint64(block.timestamp + 3600)
        });
    }

    function _signInvoice(ZowallGate.Invoice memory inv) private view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Invoice(uint256 poId,address vendor,address payee,uint128 qty,uint128 unitPrice,bytes32 invoiceHash,uint256 nonce,uint64 deadline)"
                ),
                inv.poId,
                inv.vendor,
                inv.payee,
                inv.qty,
                inv.unitPrice,
                inv.invoiceHash,
                inv.nonce,
                inv.deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VENDOR_PK, _typed(structHash));
        return abi.encodePacked(r, s, v);
    }
}
