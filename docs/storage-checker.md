# The Storage Layout Safety Checker

Read this guide if you want to learn about the storage layout issues that ChugSplash detects automatically.

When upgrading contracts, ChugSplash automatically checks that each new contract doesn't have storage layout compatibility issues with its existing contract. These issues can cause the upgraded version of the contract to have its storage values mixed up, which can lead to critical errors in your application. If ChugSplash detects any of these issues, it will throw an error before the upgrade happens.

It's worth mentioning that these restrictions have their roots in how the Ethereum VM works, and apply to all tools that manage upgradeable contracts, not just ChugSplash.

If you want to disable these checks, see the `SKIP_STORAGE_CHECK` configuration option [here](https://github.com/chugsplash/chugsplash/blob/develop/docs/live-network.md#optional-variables).

> Note: None of these rules apply to `immutable` and `constant` state variables because the Solidity compiler does not reserve a storage slot for them. [See here](https://solidity.readthedocs.io/en/latest/contracts.html#constant-state-variables) for a further explanation in the Solidity documentation.

## Correct Pattern

When upgrading a contract, you should always extend its state variables instead of removing, re-ordering, or renaming them. To introduce a new variable, make sure you always do so at the end. For example, say you have the following contract:

```sol
contract MyContract {
    uint256 x;
    string y;
}
```

To upgrade the contract so that it has a new variable, `bytes z`, you should add it to the end of the contract:

```sol
contract MyContract {
    uint256 x;
    string y;
    bytes z;
}
```

The following prevented patterns are simply all of the different ways that you can break this correct pattern.

## Prevented Patterns

Say you have an initial contract that looks like this:

```sol
contract MyContract {
    uint256 x;
    string y;
}
```

When upgrading this contract, the following operations are prevented by ChugSplash's storage layout checker.

You cannot change the type of a variable:

```sol
contract MyContract {
    string x;
    string y;
}
```

You cannot change the ordering of variables:

```sol
contract MyContract {
    string y;
    uint256 x;
}
```

You cannot introduce a new variable before existing ones:

```sol
contract MyContract {
    bytes a;
    uint256 x;
    string y;
}
```

You cannot remove an existing variable:

```sol
contract MyContract {
    string y;
}
```

You cannot rename an existing variable:
```sol
contract MyContract {
    uint256 private a;
    string private y;
}
```

## Prevented Inheritance Patterns

You cannot change the ordering of storage variables in a contract's parent contracts. For example, say you have the following contracts:

```sol
contract A {
    uint256 a;
}

contract B {
    uint256 b;
}

contract MyContract is A, B {
    uint256 z;
}
```

You cannot modify `MyContract` by swapping the order in which the base contracts are declared:

```sol
contract MyContract is B, A {
    uint256 z;
}
```

You cannot introduce new base contracts:

```sol
contract C {
    uint256 c;
}

contract MyContract is A, B, C {
    uint256 z;
}
```

You cannot add new variables to base contracts if the child has any variables of its own.

```
contract A {
    uint256 a;
    uint256 c;
}

contract B {
    uint256 b;
}

contract MyContract is A, B {
    uint256 z;
}
```

A workaround for this last scenario is to declare unused variables or storage gaps in base contracts that you may want to extend in the future, as a means of "reserving" those slots. Note that this trick does not involve increased gas usage. For more information on this approach, see [OpenZeppelin's guide on reserving storage slots](https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#storage-gaps).

## Learn More

Although it's not necessary to perform upgrades safely, you can read more about the underlying reasons for these principles at [OpenZeppelin's Proxy Upgrade Pattern guide](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies).
