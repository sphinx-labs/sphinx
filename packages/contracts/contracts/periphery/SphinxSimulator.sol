// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// TODO(end): remove unnecessary imports
import { GnosisSafeProxyFactory } from
    "@gnosis.pm/safe-contracts-1.3.0/proxies/GnosisSafeProxyFactory.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts-1.3.0/GnosisSafe.sol";
import { Enum } from "@gnosis.pm/safe-contracts-1.3.0/common/Enum.sol";
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
        bytes memory _simulationCalldata,
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
            _simulationCalldata
        ) {
            // TODO(docs): should be impossible to reach this because the `simulateAndRevert` call
            // should always revert.
            revert("SphinxSimulator: simulation never reverted");
        } catch (bytes memory retdata) {
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

        (,,,, MerkleRootStatus finalStatus,) =
            ISphinxModule(_sphinxModule).merkleRootStates(_root);
        console.log('LLL');
        require(
            finalStatus == MerkleRootStatus.COMPLETED,
            "TODO(docs): failed"
        );
        console.log('MMM');

        revert();
    }
}

// TODO(later): cases:
// - Success case
// - Failure case w/ no error message. (I think this happened with celo).
// - Failure case w/ error message.

// TODO(later-later): handle generic errors in `simulateExecution`.

// TODO(end): gh: UPDATE: the `approveThenExecute` function only accepts un-approved deployments
// because the merkle root is different than what will actually be executed on-chain (because the
// `executor` field is different).

// TODO(end): check that all error messages are prefixed with "SphinxSimulator: ".

// TODO(docs): this contract works with gnosis safe v1.3.0 and v1.4.1.

// TODO(later-later): check that this works for Safe v1.4.1 as well as the two L2 versions.
