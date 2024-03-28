// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// TODO(end): remove unnecessary imports
import { GnosisSafeProxyFactory } from
    "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";
import { GnosisSafeTransaction } from "./SphinxPeripheryDataTypes.sol";
import { SphinxLeafWithProof, MerkleRootStatus } from "../core/SphinxDataTypes.sol";
import { ManagedService } from "../core/ManagedService.sol";
import { ISphinxModule } from "../core/interfaces/ISphinxModule.sol";
import { console } from "../forge-std/src/console.sol";

contract SphinxSimulator {
    address internal immutable SPHINX_SIMULATOR = address(this);

    GnosisSafeProxyFactory internal immutable safeProxyFactory;

    address internal immutable safeSingleton;

    constructor(address _safeProxyFactory, address _safeSingleton) {
        safeProxyFactory = GnosisSafeProxyFactory(_safeProxyFactory);
        safeSingleton = _safeSingleton;
    }

    // TODO(later-later): do something with the 'payable' modifier on this function.
    function simulate(
        GnosisSafeTransaction[] memory _txns,
        GnosisSafe _safeProxy,
        bytes memory _safeInitializerData,
        uint256 _safeSaltNonce
    )
        external
        payable
        returns (bytes memory)
    {
        if (address(_safeProxy).code.length == 0) {
            safeProxyFactory.createProxyWithNonce(
                safeSingleton, _safeInitializerData, _safeSaltNonce
            );
        }

        try _safeProxy.simulateAndRevert(
            SPHINX_SIMULATOR,
            abi.encodeWithSelector(
                SphinxSimulator.getMerkleLeafGasEstimates.selector, _txns, _safeProxy
            )
        ) {
            // TODO(docs): should be impossible to reach this because the `simulateAndRevert` call
            // should always revert.
            revert("SphinxSimulator: simulation never reverted");
        } catch (bytes memory retdata) {
            return retdata;
        }
    }

    function getMerkleLeafGasEstimates(
        GnosisSafeTransaction[] memory _txns,
        GnosisSafe _safeProxy
    )
        external
        returns (uint256[] memory gasEstimates)
    {
        require(
            address(this) == address(_safeProxy), "TODO(docs): must be delegatecalled by safe proxy"
        );

        _safeProxy.enableModule(address(this));

        gasEstimates = new uint256[](_txns.length);

        address to;
        uint256 value;
        bytes memory txData;
        Enum.Operation operation;
        for (uint256 i = 0; i < _txns.length; i++) {
            GnosisSafeTransaction memory txn = _txns[i];

            to = txn.to;
            value = txn.value;
            txData = txn.txData;
            operation = txn.operation;

            uint256 startGas = gasleft();
            bool success =
                GnosisSafe(_safeProxy).execTransactionFromModule(to, value, txData, operation);
            // TODO(docs): we put the buffers off-chain to make it easier to adjust them in the
            // future.
            gasEstimates[i] = startGas - gasleft();

            require(success, "SphinxSimulator: TODO(docs)");
        }
    }

    function simulateExecution(
        GnosisSafe _safeProxy,
        ISphinxModule _sphinxModule,
        bytes32 _root,
        SphinxLeafWithProof memory _approveLeaf,
        SphinxLeafWithProof[] memory _executeLeaves,
        bytes memory _signatures,
        address[] memory _newOwners,
        bytes memory _safeInitializerData,
        uint256 _safeSaltNonce
    )
        external
        returns (bytes memory)
    {
        deployGnosisSafeIfNeeded(_safeInitializerData, _safeSaltNonce);

        console.log('AAA');
        try _safeProxy.simulateAndRevert(
            SPHINX_SIMULATOR,
            abi.encodeWithSelector(
                SphinxSimulator.approveThenExecute.selector,
                _safeProxy,
                _sphinxModule,
                _root,
                _approveLeaf,
                _executeLeaves,
                _signatures,
                _newOwners
            )
        ) {
            console.log('BBB');
            // TODO(docs): should be impossible to reach this because the `simulateAndRevert` call
            // should always revert.
            revert("SphinxSimulator: simulation never reverted");
        } catch (bytes memory retdata) {
            console.log('CCC');
            return retdata;
        }
    }

// TODO(docs): this is meant to be called before the approval occurs. if it's called after the
    // approval occurs, it will fail.
    function approveThenExecute(
        GnosisSafe _safeProxy,
        ISphinxModule _sphinxModule,
        bytes32 _root,
        SphinxLeafWithProof memory _approveLeaf,
        SphinxLeafWithProof[] memory _executeLeaves,
        bytes memory _signatures,
        address[] memory _newOwners
    )
        external
    {
        console.log('DDD');
        require(
            address(this) == address(_safeProxy), "TODO(docs): must be delegatecalled by safe proxy"
        );

        console.log('EEE');
        (,,,, MerkleRootStatus initialStatus,) =
            ISphinxModule(_sphinxModule).merkleRootStates(_root);
        require(initialStatus == MerkleRootStatus.EMPTY, "TODO(docs)");
        console.log('FFF');

        uint256 ownerThreshold = _safeProxy.getThreshold();
        require(ownerThreshold == _newOwners.length, "TODO(docs)");
        for (uint256 i = 0; i < _newOwners.length; i++) {
            _safeProxy.addOwnerWithThreshold(_newOwners[i], ownerThreshold);
        }
        console.log('GGG');

        ISphinxModule(_sphinxModule).approve(_root, _approveLeaf, _signatures);
        console.log('HHH');

        for (uint256 i = 0; i < _newOwners.length - 1; i++) {
            _safeProxy.removeOwner(_newOwners[i + 1], _newOwners[i], ownerThreshold);
        }
        _safeProxy.removeOwner(address(1), _newOwners[ownerThreshold - 1], ownerThreshold);
        console.log('III');
        // TODO(docs): explain why we remove auto-generated owners here.

        console.log('JJJ');
        ISphinxModule(_sphinxModule).execute(_executeLeaves);
        console.log('KKK');

        (, uint256 leavesExecuted,,, MerkleRootStatus finalStatus,) =
            ISphinxModule(_sphinxModule).merkleRootStates(_root);
        console.log('LLL');
        require(
            finalStatus == MerkleRootStatus.COMPLETED,
            string(abi.encodePacked("TODO(docs): failed. leavesExecuted: ", leavesExecuted))
        );
        console.log('MMM');
    }

// TODO(later): remove
    function deployGnosisSafeIfNeeded(
        bytes memory _safeInitializerData,
        uint256 _safeSaltNonce
    ) private {
        if (address(_safeProxy).code.length == 0) {
            safeProxyFactory.createProxyWithNonce(
                safeSingleton, _safeInitializerData, _safeSaltNonce
            );
        }
    }
}

// TODO(later-later): handle generic errors in `getMerkleLeafGasEstimates` and
// `approveThenExecuteDeployment`.

// TODO(later): return the `leavesExecuted`

// TODO(end): gh: UPDATE: the `approveThenExecute` function only accepts un-approved deployments
// because the merkle root is different than what will actually be executed on-chain (because the
// `executor` field is different).

// TODO(end): check that all error messages are prefixed with "SphinxSimulator: ".

// TODO(docs): this contract works with gnosis safe v1.3.0 and v1.4.1.

// TODO(later-later): check that this works for Safe v1.4.1 as well as the two L2 versions.
