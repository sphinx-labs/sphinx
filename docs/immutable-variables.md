# Defining Immutable Variables

There are two ways to assign values to immutable variables when using ChugSplash.

## 1. Direct assignment

The first option is to directly assign the immutable variable to its value in your contract. For example:

```sol
uint public immutable myNum = block.timestamp;
```

You don't need to create a variable definition in your ChugSplash config file if you do this.

## 2. Define `constructorArgs` in your ChugSplash config file

The other option is to define a `constructorArgs` field in your ChugSplash config file. This field contains the constructor arguments that correspond to your immutable variables. For example, say you have the following contract:

```sol
contract MyContract {
  uint public immutable myNum;

  constructor(uint _num) {
    myNum = _num;
  }
}
```

Your ChugSplash config file would be:
```ts
{
  options: { ... },
  contracts: {
    MyToken: {
      contract: 'MyContract',
      variables: {},
      // Define constructor arguments:
      constructorArgs: {
        _num: 2
      }
    }
  }
}
```

Notice that we assign a value to the constructor argument, `_num`, instead of the variable `myNum`.

The `constructorArgs` field can only be used for immutable variables.

### Why not use the `variables` field in the ChugSplash config file to define immutable variables?

It might seem natural to define immutable variables in the same manner that you define mutable state variables in your ChugSplash config file (via the `variables` section).

However, you **cannot** use the `variables` section in your ChugSplash config file to define immutable variables. For example, say you have an immutable variable, `myNum`, in your contract. ChugSplash would throw an error if you attempted to do:

```ts
{
  options: { ... },
  contracts: {
    MyToken: {
      contract: 'MyContract',
      variables: {
        myNum: 2 // Not allowed!
      }
    }
  }
}
```

ChugSplash does not allow this because of a restriction imposed by the Solidity compiler. Specifically, the Solidity compiler requires that immutable variables are either assigned to a value inline (as seen in the [direct assignment section](#1-direct-assignment)), or in the body of the constructor. It will throw an error otherwise. For example, consider the following contract:

```sol
contract MyContract {
  // Variable is never initialized
  uint public immutable myNum;
}
```

Compiling this contract will result in the following error thrown by the Solidity compiler:
```
TypeError: Construction control flow ends without initializing all immutable state variables.
```

To resolve this error, you must create a constructor to initialize the variable:
```sol
contract MyContract {
  uint public immutable myNum;

  constructor(uint _num) {
    myNum = _num;
  }
}
```

Since a constructor is required in this situation, the most straightforward solution is for users to pass in their constructor arguments via a `constructorArgs` section in the ChugSplash config file. We chose to make this a separate section from `variables` to avoid confusion between the two ways of assigning variables.

