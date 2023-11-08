// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import { SphinxModule } from "./SphinxModule.sol";
import {
    GnosisSafeProxyFactory
} from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxy.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";

contract SphinxModuleFactory {

    address private immutable MODULE_FACTORY = address(this);

    modifier onlyDelegateCall() {
        require(address(this) != MODULE_FACTORY, "SphinxModuleFactory: function must be delegatecalled");
        _;
    }

    event SphinxModuleDeployed(SphinxModule indexed sphinxModule, address indexed safeProxy);

    function deploySphinxModule(
        address _safeProxy,
        bytes32 _salt
    ) public returns (SphinxModule sphinxModule) {
        sphinxModule = SphinxModule(Create2.deploy(0, _salt, abi.encodePacked(type(SphinxModule).creationCode, abi.encode(_safeProxy))));
        emit SphinxModuleDeployed(sphinxModule, _safeProxy);
    }

    // TODO(docs): Meant to be called by a GnosisSafe. This allows us to deploy the SphinxModule
    // from the Safe during the Safe's initialization without needing to know its address
    // beforehand. (explain the circular dependency that would happen if we needed to pass in its
    // address. the Safe initializer data would need to include the Safe's address, but its address
    // is determined by the initializer data when deploying with
    // `GnosisSafeProxyFactory.createProxyWithNonce`).
    function deploySphinxModuleFromSafe(
        bytes32 _salt
    ) public {
        deploySphinxModule(msg.sender, _salt);
    }

    // TODO(docs): must be delegatecalled by a safe.
    function enableSphinxModule(
        bytes32 _salt
    ) public onlyDelegateCall {
        address sphinxModule = computeSphinxModuleAddress(address(this), _salt);
        GnosisSafe(payable(address(this))).enableModule(sphinxModule);
    }

    function computeSphinxModuleAddress(
        address _safeProxy,
        bytes32 _salt
    ) public view returns (address) {
        return Create2.computeAddress(_salt, keccak256(abi.encodePacked(type(SphinxModule).creationCode, abi.encode(_safeProxy))), MODULE_FACTORY);
    }
}
