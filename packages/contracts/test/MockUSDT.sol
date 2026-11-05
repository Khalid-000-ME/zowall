// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev Six decimals, like the real Whitechain Sepolia USDT. Tests only -
///      deployments settle in the real token.
contract MockUSDT {
    string public name = "Tether USD";
    string public symbol = "USDT";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
