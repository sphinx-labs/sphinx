# Calling Permissioned Functions

After deploying a contract with an ownership mechanism such as OpenZeppelin's `AccessControl` or `Ownable`, you may need to call permissioned functions on it. To do this, you must grant the appropriate role to your [`SphinxManager`](https://github.com/sphinx-labs/sphinx/blob/develop/docs/sphinx-manager.md) in the constructor of your contract. Once you've finished executing the permissioned transactions, you must transfer ownership to your final owner (e.g. your multisig) because the `SphinxManager` is not audited yet.

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

Say you want to deploy the `PermissionedBox` contract, then call the `setValue` function, then transfer ownership to a new owner. Here is a deployment function that does this:

```
function run() public override sphinx {
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

This pattern works can work for any common ownership mechanism, including OpenZeppelin's `Ownable` and `AccessControl`.
