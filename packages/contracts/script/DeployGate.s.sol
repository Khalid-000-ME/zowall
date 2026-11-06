// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {ZowallGate} from "../src/ZowallGate.sol";

/**
 * Deploys the gate against the real Whitechain Sepolia USDT. The token address
 * is read from the environment and sanity-checked rather than deployed here, so
 * a deployment can never end up pointing at a stand-in token.
 *
 *   forge script script/DeployGate.s.sol \
 *     --rpc-url https://rpc.testnet.whitechain.io/ --private-key $PRIVATE_KEY \
 *     --broadcast --verify --verifier blockscout \
 *     --verifier-url https://explorer.testnet.whitechain.io/api/
 */
contract DeployGate is Script {
    function run() external returns (ZowallGate gate) {
        address usdt = vm.envAddress("USDT_ADDRESS");
        // The attestors are a quorum of independent services. A comma-separated
        // list, and the number of them that must agree.
        address[] memory attestors = vm.envAddress("ATTESTOR_ADDRESSES", ",");
        uint8 threshold = uint8(vm.envUint("ATTESTOR_THRESHOLD"));

        // Six decimals on Whitechain Sepolia. If this ever reads 18, every
        // amount in the app is wrong by a factor of a trillion, so fail loudly.
        uint8 decimals = IERC20(usdt).decimals();
        require(decimals == 6, "USDT is not 6 decimals - check the address");

        vm.startBroadcast();
        gate = new ZowallGate(IERC20(usdt), attestors, threshold);
        vm.stopBroadcast();

        console.log("chainId      ", block.chainid);
        console.log("ZowallGate   ", address(gate));
        console.log("USDT         ", usdt);
        console.log("threshold    ", threshold);
        for (uint256 i; i < attestors.length; ++i) {
            console.log("attestor     ", attestors[i]);
        }
        console.log("domainSep    ");
        console.logBytes32(gate.domainSeparator());
    }
}
