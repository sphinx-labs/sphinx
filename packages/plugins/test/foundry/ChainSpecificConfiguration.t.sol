// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import { ChainSpecificConfiguration } from "../../script/ChainSpecificConfiguration.s.sol";
import { Network } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";

contract ChainSpecificTestOptimism is Test, ChainSpecificConfiguration {
    function setUp() public {
        string memory alchemyAPIKey = vm.envString("ALCHEMY_API_KEY");
        string memory rpcUrl = string(abi.encodePacked("https://opt-mainnet.g.alchemy.com/v2/", alchemyAPIKey));
        vm.createSelectFork(rpcUrl);
        deploy(Network.optimism);
    }

    function testDeployAllNetworkContract() public {
        assertTrue(address(allNetworks) != address(0), "allNetworks should be deployed on optimism");
    }

    function testDeployWithCorrectAddress() public {
        assertEq(allNetworks.someOtherProtocolAddress(), chainSpecificAddresses[Network.optimism]);
    }

    function testSetFeeCorrectly() public {
        assertEq(allNetworks.feePercent(), chainSpecificFee[Network.optimism]);
    }

    function testDeployOnlyArbitrum() public {
        assertTrue(address(onlyArbitrum) == address(0), "onlyArbitrum should not be deployed on optimism");
    }
}

contract ChainSpecificTestEthereum is Test, ChainSpecificConfiguration {
    function setUp() public {
        string memory alchemyAPIKey = vm.envString("ALCHEMY_API_KEY");
        string memory rpcUrl = string(abi.encodePacked("https://eth-mainnet.g.alchemy.com/v2/", alchemyAPIKey));
        vm.createSelectFork(rpcUrl);
        deploy(Network.ethereum);
    }

    function testDeployAllNetworkContract() public {
        assertTrue(address(allNetworks) != address(0), "allNetworks should be deployed on ethereum");
    }

    function testDeployWithCorrectAddress() public {
        assertEq(allNetworks.someOtherProtocolAddress(), chainSpecificAddresses[Network.ethereum]);
    }

    function testSetFeeCorrectly() public {
        assertEq(allNetworks.feePercent(), chainSpecificFee[Network.ethereum]);
    }

    function testDeployOnlyArbitrum() public {
        assertTrue(address(onlyArbitrum) == address(0), "onlyArbitrum should not be deployed on ethereum");
    }
}

contract ChainSpecificTestArbitrum is Test, ChainSpecificConfiguration {
    function setUp() public {
        string memory alchemyAPIKey = vm.envString("ALCHEMY_API_KEY");
        string memory rpcUrl = string(abi.encodePacked("https://arb-mainnet.g.alchemy.com/v2/", alchemyAPIKey));
        vm.createSelectFork(rpcUrl);
        deploy(Network.arbitrum);
    }

    function testDeployAllNetworkContract() public {
        assertTrue(address(allNetworks) != address(0), "allNetworks should be deployed on optimism");
    }

    function testDeployWithCorrectAddress() public {
        assertEq(allNetworks.someOtherProtocolAddress(), chainSpecificAddresses[Network.arbitrum]);
    }

    function testSetFeeCorrectly() public {
        assertEq(allNetworks.feePercent(), chainSpecificFee[Network.arbitrum]);
    }

    function testDeployOnlyArbitrum() public {
        assertTrue(address(onlyArbitrum) != address(0), "onlyArbitrum should be deployed on arbitrum");
    }

    function testIncrementOnlyArbitrum() public {
        assertEq(onlyArbitrum.number(), 2);
    }
}