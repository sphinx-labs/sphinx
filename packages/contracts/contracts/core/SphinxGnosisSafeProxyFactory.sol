// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ISphinxGnosisSafeProxyFactory } from "./interfaces/ISphinxGnosisSafeProxyFactory.sol";
import { ISphinxModuleProxyFactory } from "./interfaces/ISphinxModuleProxyFactory.sol";
import { GnosisSafeVersion } from "./SphinxDataTypes.sol";
// Import Gnosis Safe proxy v1.3.0 and v1.4.1, which we'll deploy in this file.
import {
    GnosisSafeProxy as GnosisSafeProxy_v1_3_0
} from "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxy.sol";
import {
    SafeProxy as GnosisSafeProxy_v1_4_1
} from "@gnosis.pm/safe-contracts-1.4.1/proxies/SafeProxy.sol";
// Import contracts from Gnosis Safe v1.3.0, which we'll use as interfaces in this file. All of
// these contracts have the same interface as Gnosis Safe v1.4.1 for the functions used in this
// contract.
import { MultiSend } from "@gnosis.pm/safe-contracts-1.3.0/libraries/MultiSend.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";

contract SphinxGnosisSafeProxyFactory is ISphinxGnosisSafeProxyFactory {
    ISphinxModuleProxyFactory private immutable moduleProxyFactory;

    MultiSend private immutable multiSend;

    constructor(ISphinxModuleProxyFactory _moduleProxyFactory, MultiSend _multiSend) {
        moduleProxyFactory = _moduleProxyFactory;
        multiSend = _multiSend;
    }

    /**
     * @param _owners The addresses that will own the deployed Gnosis Safe. These should be sorted
     *                in ascending order off-chain so that the address of the Gnosis Safe proxy can
     *                easily be calculated by off-chain tooling.
     */
    function deployGnosisSafeWithModule(
        address[] memory _owners,
        uint256 _threshold,
        uint256 _saltNonce,
        address _safeSingleton,
        address _fallbackHandler,
        GnosisSafeVersion _safeVersion
    ) public returns (address safeProxy, address moduleProxy) {
        // We don't validate the `_owners` and `_threshold` because the Gnosis Safe singleton
        // already validates them.

        bytes memory multiSendData = makeMultiSendData(_saltNonce);

        // Get the address of the Sphinx Module proxy that will be deployed.
        moduleProxy = moduleProxyFactory.computeSphinxModuleProxyAddress(
            safeProxy, // TODO(later): `safeProxy` isn't defined yet
            safeProxy,
            _saltNonce
        );

        // Encode the call to the Gnosis Safe's `setup` function, which is an input to the
        // Gnosis Safe proxy's `CREATE2` salt.
        bytes memory safeInitializerData = abi.encodeWithSelector(
            GnosisSafe.setup.selector,
            _owners,
            _threshold,
            multiSend,
            multiSendData,
            _fallbackHandler,
            // The following fields are for specifying an optional payment as part of the
            // deployment. We don't use them.
            address(0),
            0,
            address(0)
        );

        // Create the Gnosis Safe proxy's `CREATE2` salt. This salt ensures that the proxy's address
        // changes if its initializer data changes. This salt is created in the exact same manner as
        // the salt created in the Gnosis Safe Proxy Factory contract. The initializer data
        // is hashed because it's cheaper than concatenating it.
        bytes32 safeSalt = keccak256(abi.encodePacked(keccak256(safeInitializerData), _saltNonce));

        // Deploy the Gnosis Safe proxy. Both versions of the proxy are functionally identical, but
        // their bytecode is different because they have different metadata hashes. We make it
        // possible to deploy either version to ensure that this contract is fully compatible with
        // both Gnosis Safe v1.3.0 and v1.4.1.
        safeProxy = _safeVersion == GnosisSafeVersion.v1_3_0
            ? address(new GnosisSafeProxy_v1_3_0{ salt: safeSalt }(_safeSingleton))
            : address(new GnosisSafeProxy_v1_4_1{ salt: safeSalt }(_safeSingleton));

        emit DeployedGnosisSafeWithModule(
            safeProxy,
            moduleProxy,
            _saltNonce,
            _safeSingleton,
            _safeVersion
        );

        // Initialize the Gnosis Safe proxy using the exact same data as the `safeInitializerData`
        // above.
        GnosisSafe(payable(safeProxy)).setup(
            _owners,
            _threshold,
            address(multiSend),
            multiSendData,
            _fallbackHandler,
            // The following fields are for specifying an optional payment as part of the
            // deployment. We don't use them.
            address(0),
            0,
            payable(address(0))
        );

        // Check that the Sphinx Module proxy is deployed and that it's enabled in the Gnosis Safe
        // proxy. We don't need to check that the Gnosis Safe proxy is deployed because we deployed
        // it via `CREATE2` above, which must have succeeded if we were able to make it to this
        // point.
        require(
            moduleProxy.code.length > 0,
            "SphinxGnosisSafeProxyFactory: module proxy not deployed"
        );
        require(
            GnosisSafe(payable(safeProxy)).isModuleEnabled(moduleProxy),
            "SphinxGnosisSafeProxyFactory: module proxy not enabled"
        );
    }

    function makeMultiSendData(uint256 _saltNonce) internal view returns (bytes memory) {
        // Encode the data that will deploy the Sphinx Module proxy.
        bytes memory encodedDeployModuleCall = abi.encodeWithSelector(
            moduleProxyFactory.deploySphinxModuleProxyFromSafe.selector,
            _saltNonce
        );
        // Encode the data in a format that can be executed using `MultiSend`.
        bytes memory deployModuleMultiSendData = abi.encodePacked(
            // We use `Call` so that the Gnosis Safe proxy calls the `SphinxModuleProxyFactory` to deploy
            // the Sphinx Module proxy. This makes it easier for off-chain tooling to calculate the
            // deployed Sphinx Module proxy address because the `SphinxModuleProxyFactory`'s address is a
            // known constant.
            uint8(Enum.Operation.Call),
            moduleProxyFactory,
            uint256(0), // Set the value to 0 because we never send native gas tokens in this call
            encodedDeployModuleCall.length,
            encodedDeployModuleCall
        );

        // Encode the data that will enable the Sphinx Module proxy in the Gnosis Safe proxy.
        bytes memory encodedEnableModuleCall = abi.encodeWithSelector(
            moduleProxyFactory.enableSphinxModuleProxyFromSafe.selector,
            _saltNonce
        );
        // Encode the data in a format that can be executed using `MultiSend`.
        bytes memory enableModuleMultiSendData = abi.encodePacked(
            // The Gnosis Safe proxy will delegatecall the SphinxModuleProxyFactory to enable the
            // module. This is necessary because the Sphinx Module proxy's address can't be included
            // in the Gnosis Safe proxy's initializer data.
            uint8(Enum.Operation.DelegateCall),
            moduleProxyFactory,
            uint256(0), // Set the value to 0 because we never send native gas tokens in this delegatecall.
            encodedEnableModuleCall.length,
            encodedEnableModuleCall
        );

        // Encode the entire `MultiSend` data.
        return
            abi.encodeWithSelector(
                MultiSend.multiSend.selector,
                bytes.concat(deployModuleMultiSendData, enableModuleMultiSendData)
            );
    }
}
