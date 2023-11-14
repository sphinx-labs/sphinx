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

contract SphinxModuleFactory {
    address private immutable MODULE_FACTORY = address(this);

    event SphinxModuleDeployed(SphinxModule indexed sphinxModule, address indexed safeProxy);

    event SphinxModuleEnabled(address indexed sphinxModule, address indexed safeProxy);

    // TODO(docs): deploys a SphinxModule at a deterministic address based on the caller's address,
    // an arbitrary salt, and the Safe address input parameter.
    function deploySphinxModule(
        address _safeProxy,
        uint256 _saltNonce
    ) public returns (SphinxModule sphinxModule) {
        bytes32 salt = keccak256(abi.encode(msg.sender, _saltNonce));
        sphinxModule = SphinxModule(
            Create2.deploy(
                0,
                salt,
                abi.encodePacked(type(SphinxModule).creationCode, abi.encode(_safeProxy))
            )
        );
        emit SphinxModuleDeployed(sphinxModule, _safeProxy);
    }

    // TODO(docs): Meant to be called by a GnosisSafe. This allows us to deploy the SphinxModule
    // from the Safe during the Safe's initialization without needing to know its address
    // beforehand. (explain the circular dependency that would happen if we needed to pass in its
    // address. the Safe initializer data would need to include the Safe's address, but its address
    // is determined by the initializer data when deploying with
    // `GnosisSafeProxyFactory.createProxyWithNonce`).
    // TODO(docs): deploys a SphinxModule at a deterministic address based on the caller's address
    // and an arbitrary salt.
    function deploySphinxModuleFromSafe(uint256 _saltNonce) public {
        require(address(this) == MODULE_FACTORY, "SphinxModuleFactory: delegatecall not allowed");
        deploySphinxModule(msg.sender, _saltNonce);
    }

    // TODO(docs): delegatecalling prevents a malicious actor from being able to snipe a SphinxModule
    // address inside the call to `enableModule`.
    // TODO(docs): this function assumes that the deployer of the SphinxModule is the GnosisSafe. if the deployer is a different account, the Safe should use `Safe.enableModule` instead.
    // TODO(docs): must be delegatecalled by a safe. will revert if the SphinxModule is already
    // enabled in the Safe (at least in Safe v.1.3.0).
    // TODO(invariants):
    // - desc: enables a SphinxModule in a Gnosis Safe.
    // - must revert if not delegatecalled
    // - must emit a SphinxModuleEnabled event in the Safe (not the SphinxModuleFactory)

    /**
     * @notice Enables a `SphinxModule` within a Gnosis Safe. Must be delegatecalled by
     * the Gnosis Safe. This function is meant to be called during the initialization of a Gnosis
       Safe after calling `SphinxModuleFactory.deploySphinxModuleFromSafe`. To enable a SphinxModule
       after a Gnosis Safe has been initialized, use the Gnosis Safe's `enableModule` function
       instead.

       We cannot use the address of the Gnosis Safe or the address of the `SphinxModule` as
       an input parameter to this function because this would cause a circular dependency when
       calculating the initializer data. Specifically, the initializer data would need to include
       the address of the SphinxModule or the address of the Gnosis Safe, which are both determined
       by the initializer data.
     *
     * @param _saltNonce An arbitrary nonce that is used as an input to the CREATE2 salt which
     * determines the address of the `SphinxModule`.
     */
    function enableSphinxModuleFromSafe(uint256 _saltNonce) public {
        require(address(this) != MODULE_FACTORY, "SphinxModuleFactory: must be delegatecalled");
        address sphinxModule = computeSphinxModuleAddress(address(this), address(this), _saltNonce);
        GnosisSafe(payable(address(this))).enableModule(sphinxModule);
        emit SphinxModuleEnabled(sphinxModule, address(this));
    }

    // TODO(spec): Deploys `SphinxModule` contracts using CREATE2. The address of a `SphinxModule` is determined by the following inputs:
    // - `address safeProxy`: The address of the Gnosis Safe proxy contract that the `SphinxModule` belongs to.
    // - `address caller`: The address of the caller that deployed (or will deploy) the `SphinxModule` through the `SphinxModuleFactory`.
    // - `uint256 saltNonce`: An arbitrary nonce.

    /**
     * @notice Computes the address of a `SphinxModule` contract. Assumes that the deployer of the
     * `SphinxModule` is this `SphinxModuleFactory` contract.
     *
     * @param _safeProxy The address of the Gnosis Safe proxy contract that the `SphinxModule` belongs to.
     * @param _caller    The address of the caller that deployed (or will deploy) the `SphinxModule` through the `SphinxModuleFactory`.
     * @param _saltNonce An arbitrary nonce, which is one of the inputs that determines the address of the `SphinxModule`.
     */
    function computeSphinxModuleAddress(
        address _safeProxy,
        address _caller,
        uint256 _saltNonce
    ) public view returns (address) {
        bytes32 salt = keccak256(abi.encode(_caller, _saltNonce));
        return
            Create2.computeAddress(
                salt,
                keccak256(
                    abi.encodePacked(type(SphinxModule).creationCode, abi.encode(_safeProxy))
                ),
                MODULE_FACTORY
            );
    }
}
