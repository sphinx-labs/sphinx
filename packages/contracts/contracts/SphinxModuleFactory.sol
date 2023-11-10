// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import { console } from "sphinx-forge-std/console.sol"; // TODO: rm
import { SphinxModule } from "./SphinxModule.sol";
import {
    GnosisSafeProxyFactory
} from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/GnosisSafe.sol";
import { GnosisSafeProxy } from "@gnosis.pm/safe-contracts/proxies/GnosisSafeProxy.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";

// TODO(A-invariant):
// - it must be possible to deploy a SphinxModule and enable it during the initialization of a Gnosis
//   Safe.
// - an address must not be able to deploy or enable a SphinxModule on behalf of another
//   address. (this is because these actions may be encoded into the Safe's initializer data, which
//   must be able to initialize a safe on new chains to yield the same create2 address.) on a higher
//   level, it must be possible for anyone to deploy a Safe then initialize it with the SphinxModule
//   at a deterministic address on new networks. it must not be possible for a malicious actor to
//   interfere with this transaction by causing it to fail or initializing the Safe incorrectly.

// TODO(A-invariant): everything applies for gnosis safe v1.3.0 and v1.4.1.

// TODO(docs):
// - desc: Deploys SphinxModule contracts at deterministic addresses and enables them within Gnosis Safes.
contract SphinxModuleFactory {

    address private immutable MODULE_FACTORY = address(this);

    event SphinxModuleDeployed(SphinxModule indexed sphinxModule, address indexed safeProxy);

    event SphinxModuleEnabled(address indexed sphinxModule, address indexed safeProxy);

    // TODO(invariants):
    // - desc: deploys a SphinxModule at a deterministic address based on the caller's address, an arbitrary salt, and the Safe address input parameter.
    // - must revert if a SphinxModule already exists at an address
    // - must be possible to deploy more than one SphinxModule for a given caller
    // - must emit a SphinxModuleDeployed event
    // - must return the address of the deployed SphinxModule
    function deploySphinxModule(
        address _safeProxy,
        uint256 _saltNonce
    ) public returns (SphinxModule sphinxModule) {
        bytes32 salt = keccak256(abi.encode(msg.sender, _saltNonce));
        sphinxModule = SphinxModule(Create2.deploy(0, salt, abi.encodePacked(type(SphinxModule).creationCode, abi.encode(_safeProxy))));
        emit SphinxModuleDeployed(sphinxModule, _safeProxy);
    }

    // TODO(docs): Meant to be called by a GnosisSafe. This allows us to deploy the SphinxModule
    // from the Safe during the Safe's initialization without needing to know its address
    // beforehand. (explain the circular dependency that would happen if we needed to pass in its
    // address. the Safe initializer data would need to include the Safe's address, but its address
    // is determined by the initializer data when deploying with
    // `GnosisSafeProxyFactory.createProxyWithNonce`).
    // TODO(invariants):
    // - desc: deploys a SphinxModule at a deterministic address based on the caller's address and an arbitrary salt.
    // - must revert if delegatecalled
    // - must revert if a SphinxModule already exists at an address
    // - must be possible to deploy more than one SphinxModule for a given caller
    // - must emit a SphinxModuleDeployed event
    function deploySphinxModuleFromSafe(
        uint256 _saltNonce
    ) public {
        require(address(this) == MODULE_FACTORY, "SphinxModuleFactory: delegatecall not allowed");
        deploySphinxModule(msg.sender, _saltNonce);
    }

    // TODO(docs): delegatecalling prevents a malicious actor from being able to snipe a SphinxModule
    // address inside the call to `enableModule`.
    // TODO(docs): must be delegatecalled by a safe. will revert if the SphinxModule is already
    // enabled in the Safe (at least in Safe v.1.3.0). the SphinxModule does not need to be
    // deployed yet.
    // TODO(invariants):
    // - desc: enables a SphinxModule in a Gnosis Safe.
    // - must revert if not delegatecalled
    // - must emit a SphinxModuleEnabled event in the Safe (not the SphinxModuleFactory)
    function enableSphinxModule(
        uint256 _saltNonce
    ) public {
        console.log('msgSender', msg.sender);
        console.log('this', address(this));
        require(address(this) != MODULE_FACTORY, "SphinxModuleFactory: must be delegatecalled");
        console.log('same addresses');
        address sphinxModule = computeSphinxModuleAddress(address(this), address(this), _saltNonce);
        GnosisSafe(payable(address(this))).enableModule(sphinxModule);
        emit SphinxModuleEnabled(sphinxModule, address(this));
    }

    function computeSphinxModuleAddress(
        address _safeProxy,
        address _deployer,
        uint256 _saltNonce
    ) public view returns (address) {
        bytes32 salt = keccak256(abi.encode(_deployer, _saltNonce));
        return Create2.computeAddress(salt, keccak256(abi.encodePacked(type(SphinxModule).creationCode, abi.encode(_safeProxy))), MODULE_FACTORY);
    }
}
