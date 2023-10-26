# Calling permissioned functions on your contracts

After deploying a contract with an ownership mechanism such as OpenZeppelin's `AccessControl` or `Ownable`, you may need to call permissioned functions on it. To do this, you must grant the appropriate role to your [`SphinxManager`](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-manager.md) in the constructor of your contract. Once you've finished executing the permissioned transactions, you should transfer ownership to your final owner (e.g. your multisig).

The rest of this guide will walk you through an example showing how to do this.

## Sample Contract
The `PermissionedBox` contract inherits `Ownable` and stores a single `value` state variable. Only the owner can set the value by calling `setValue`.

```
contract PermissionedBox is Ownable {
    uint public value;

    constructor(address _owner) {
        _transferOwnership(_owner);
    }

    setValue(uint _value) onlyOwner {
        value = _value;
    }
}
```

Say that you want to deploy the `PermissionedBox` contract, then call the `setValue` function, then transfer ownership to a new owner. Here is a `deploy` function that does this:

```
function deploy(Network _network) public override sphinx(_network) {
    // Deploy the PermissionedBox contract. We set the SphinxManager as the initial
    // owner using the `sphinxManager(sphinxConfig)` utility function, which is
    // inherited automatically via the SphinxClient contract.
    PermissionedBox permissionedBox = deployPermissionedBox(sphinxManager(sphinxConfig));

    // Call the permissioned function
    permissionedBox.setValue(5);

    // Transfer ownership to the final owner
    permissionedBox.transferOwnership(address(0x1234));
}
```

This pattern works can work for any common ownership mechanism, including OpenZeppelin's `Ownable` and `AccessControl`. If you have any questions or run into problems, feel free to reach out in the [Discord](https://discord.gg/7Gc3DK33Np).

> We strongly recommend that you make sure you always transfer ownership of your contracts away from the `SphinxManager` after your deployment is complete since the Sphinx core contracts are not audited yet.
