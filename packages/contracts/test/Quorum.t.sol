// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MockUSDT} from "./MockUSDT.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {ZowallGate} from "../src/ZowallGate.sol";

/**
 * One key that can mint a person is one key that can drain the vault: an
 * attacker holding it names themselves vendor and payee, signs for their own
 * delivery with a person who does not exist, and is paid. So the attestor is a
 * quorum, and each member is an independent service that verifies the World ID
 * proof itself.
 *
 * These tests are about what a quorum must refuse, not what it must allow.
 */
contract QuorumTest is Test {
    MockUSDT usdt;
    ZowallGate gate;

    uint256[3] pks = [uint256(0xA1), uint256(0xA2), uint256(0xA3)];
    address[3] who;
    uint256 constant OUTSIDER_PK = 0xBAD1;

    bytes32 constant ALICE = bytes32(uint256(0xA11CE));
    uint256 nonce;

    function setUp() public {
        usdt = new MockUSDT();
        address[] memory set = new address[](3);
        for (uint256 i; i < 3; ++i) {
            who[i] = vm.addr(pks[i]);
            set[i] = who[i];
        }
        gate = new ZowallGate(IERC20(address(usdt)), set, 2); // two of three
        usdt.mint(address(gate), 10_000_000_000);
        vm.warp(1_800_000_000);
    }

    function _po() private view returns (ZowallGate.POInput memory) {
        return ZowallGate.POInput({
            vendor: address(0x1111),
            payee: address(0xBEEF),
            specHash: keccak256("x"),
            qty: 10,
            unitPrice: 1_000_000,
            priceTolBps: 0,
            qtyTolBps: 0,
            expiry: uint64(block.timestamp + 86_400)
        });
    }

    function _unsigned() private returns (ZowallGate.Attestation memory a, bytes32 digest) {
        a = ZowallGate.Attestation({
            personId: ALICE,
            role: uint8(ZowallGate.Role.Creator),
            expiry: uint64(block.timestamp + 600),
            poId: 0,
            actionHash: gate.createActionHash(_po()),
            nonce: ++nonce,
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
        digest = keccak256(abi.encodePacked("\x19\x01", gate.domainSeparator(), structHash));
    }

    function _sig(uint256 pk, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// Signatures from the given keys, ordered by signer address as the gate requires.
    function _sorted(uint256[] memory keys, bytes32 digest) private pure returns (bytes memory out) {
        for (uint256 i; i < keys.length; ++i) {
            for (uint256 j = i + 1; j < keys.length; ++j) {
                if (vm.addr(keys[j]) < vm.addr(keys[i])) (keys[i], keys[j]) = (keys[j], keys[i]);
            }
        }
        for (uint256 i; i < keys.length; ++i) {
            out = bytes.concat(out, _sig(keys[i], digest));
        }
    }

    function _two() private view returns (uint256[] memory k) {
        k = new uint256[](2);
        k[0] = pks[0];
        k[1] = pks[1];
    }

    /* --------------------------------------------------------------- tests -- */

    function test_twoOfThreeAccepts() public {
        (ZowallGate.Attestation memory a, bytes32 d) = _unsigned();
        a.sig = _sorted(_two(), d);
        uint256 id = gate.createPO(_po(), a);
        assertEq(id, 1);
    }

    function test_allThreeAccepts() public {
        (ZowallGate.Attestation memory a, bytes32 d) = _unsigned();
        uint256[] memory k = new uint256[](3);
        for (uint256 i; i < 3; ++i) k[i] = pks[i];
        a.sig = _sorted(k, d);
        gate.createPO(_po(), a);
    }

    function test_oneKeyAloneCannotMintAPerson() public {
        // The compromised-attestor case. One stolen key is not enough.
        (ZowallGate.Attestation memory a, bytes32 d) = _unsigned();
        a.sig = _sig(pks[0], d);
        vm.expectRevert(ZowallGate.BadAttestation.selector);
        gate.createPO(_po(), a);
    }

    function test_theSameKeyTwiceIsNotTwoAttestors() public {
        (ZowallGate.Attestation memory a, bytes32 d) = _unsigned();
        bytes memory one = _sig(pks[0], d);
        a.sig = bytes.concat(one, one);
        vm.expectRevert(ZowallGate.BadAttestation.selector);
        gate.createPO(_po(), a);
    }

    function test_signaturesOutOfOrderAreRefused() public {
        (ZowallGate.Attestation memory a, bytes32 d) = _unsigned();
        uint256[] memory k = _two();
        bytes memory sorted = _sorted(k, d);
        // swap the two 65-byte halves
        a.sig = bytes.concat(_slice(sorted, 65, 65), _slice(sorted, 0, 65));
        vm.expectRevert(ZowallGate.BadAttestation.selector);
        gate.createPO(_po(), a);
    }

    function test_oneRealAndOneOutsiderIsNotAQuorum() public {
        (ZowallGate.Attestation memory a, bytes32 d) = _unsigned();
        uint256[] memory k = new uint256[](2);
        k[0] = pks[0];
        k[1] = OUTSIDER_PK;
        a.sig = _sorted(k, d);
        vm.expectRevert(ZowallGate.BadAttestation.selector);
        gate.createPO(_po(), a);
    }

    function test_aSignatureThatIsNotSixtyFiveBytesIsRefused() public {
        (ZowallGate.Attestation memory a, bytes32 d) = _unsigned();
        a.sig = bytes.concat(_sorted(_two(), d), hex"00");
        vm.expectRevert(ZowallGate.BadAttestation.selector);
        gate.createPO(_po(), a);
    }

    function test_signaturesForADifferentActionDoNotCount() public {
        // Two attestors signed for one set of terms; they cannot be moved to another.
        (ZowallGate.Attestation memory a, bytes32 d) = _unsigned();
        a.sig = _sorted(_two(), d);
        ZowallGate.POInput memory other = _po();
        other.payee = address(0xDEAD);
        vm.expectRevert();
        gate.createPO(other, a);
    }

    /* -------------------------------------------------- the constructor -- */

    function _set(uint256 n) private pure returns (address[] memory s) {
        s = new address[](n);
        for (uint256 i; i < n; ++i) s[i] = address(uint160(0x100 + i));
    }

    function test_zeroThresholdCannotBeDeployed() public {
        vm.expectRevert(abi.encodeWithSelector(ZowallGate.BadQuorum.selector, 0, 3));
        new ZowallGate(IERC20(address(usdt)), _set(3), 0);
    }

    function test_unreachableThresholdCannotBeDeployed() public {
        vm.expectRevert(abi.encodeWithSelector(ZowallGate.BadQuorum.selector, 4, 3));
        new ZowallGate(IERC20(address(usdt)), _set(3), 4);
    }

    function test_duplicateAttestorCannotBeDeployed() public {
        address[] memory s = _set(2);
        s[1] = s[0];
        vm.expectRevert(abi.encodeWithSelector(ZowallGate.BadQuorum.selector, 2, 2));
        new ZowallGate(IERC20(address(usdt)), s, 2);
    }

    function test_zeroAddressAttestorCannotBeDeployed() public {
        address[] memory s = _set(2);
        s[0] = address(0);
        vm.expectRevert(abi.encodeWithSelector(ZowallGate.BadQuorum.selector, 1, 2));
        new ZowallGate(IERC20(address(usdt)), s, 1);
    }

    function _slice(bytes memory b, uint256 start, uint256 len) private pure returns (bytes memory out) {
        out = new bytes(len);
        for (uint256 i; i < len; ++i) out[i] = b[start + i];
    }
}
