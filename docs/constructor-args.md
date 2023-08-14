# Constructor Args in a Sphinx Config File

This is a reference that shows how to define every constructor argument type in a Sphinx config file.

## Table of Contents

- [Booleans](#booleans)
- [Integers](#integers)
  - [Unsigned Integers (`uint`)](#unsigned-integers-uint)
  - [Signed Integers (`int`)](#signed-integers-int)
- [Addresses and Contracts](#addresses-and-contracts)
- [Contract References](#contract-references)
- [Fixed-size bytes (`bytes1`, `bytes2`, ..., `bytes32`)](#fixed-size-bytes-bytes1-bytes2--bytes32)
- [Dynamically-sized bytes](#dynamically-sized-bytes)
- [Strings](#strings)
- [Unicode strings](#unicode-strings)
- [Enums](#enums)
  - [TypeScript](#typescript)
  - [JavaScript](#javascript)
- [Arrays](#arrays)
  - [Nested arrays](#nested-arrays)
  - [Multi nested array](#multi-nested-array)
  - [Dynamic arrays](#dynamic-arrays)
- [Structs](#structs)
  - [Complex structs](#complex-structs)
- [User-Defined Value Types](#user-defined-value-types)

## Booleans

```ts
myBool: true
```

## Integers

You can define an integer as a number, string, or [`BigNumber`](https://docs.ethers.org/v5/api/utils/bignumber/).

### Unsigned Integers (`uint`)

```ts
myUint: 123
myUint: '123'
myUint: ethers.BigNumber.from(123)
```

### Signed Integers (`int`)

```ts
myInt: -123
myInt: '-123'
myInt: ethers.BigNumber.from(-123)
```

## Addresses and Contracts

Addresses and contracts don't need to be checksummed, i.e. lowercase hex strings are accepted.

```ts
myAddress: '0x0000000000000000000000000000000000000000'
myContract: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
```

## Contract References

A _contract reference_ is a string that equals the address of a contract defined in your config file.

For example, say you have a contract defined in your config file like this:
```ts
MyFirstContract: {
  contract: 'HelloSphinx',
  kind: 'immutable',
  constructorArgs: { ... }
}
```

The [reference name](https://github.com/sphinx-labs/sphinx/blob/develop/docs/config-file.md#reference-names) of this contract is `MyFirstContract`. You can use the contract reference `{{ MyFirstContract }}` as a constructor argument value anywhere in your config file. For example, if you have another contract in your config file, you can do this:

```ts
MySecondContract: {
  contract: 'HelloSphinx',
  kind: 'immutable',
  constructorArgs: {
    _myFirstContract: '{{ MyFirstContract }}' // Address of MyFirstContract
  }
}
```

Contract references can be used for variables of type `address`, `address payable`, or contract types.

Contract references are case-sensitive. So, in the example above, this is not valid:
```ts
_myFirstContract: '{{ CONTRACTONE }}' // Invalid reference name
```

## Fixed-size bytes (`bytes1`, `bytes2`, ..., `bytes32`)

```ts
myBytes4: '0xabcd1234'
```

## Dynamically-sized bytes

```ts
myBytes: '0xc24c743268ce26f68cb820c7b58ec4841de32da07de505049b09405e0372'
```

## Strings

```ts
myString: 'myStringValue'
```

## Unicode strings

```ts
myUnicodeString: 'Hello 😃'
```

## Enums

### TypeScript

Define your Enum in TypeScript:
```ts
const enum MyEnum {
  'A', 'B', 'C',
}
```

In your Sphinx config file:
```ts
myEnum: MyEnum.B
```

### JavaScript

In your Sphinx config file:
```js
myEnum: 2 // equivalent to the third enum value since enums are zero-indexed
```

## Arrays

```ts
myArray: [1, 2, 3]
```

### Nested arrays

Define your array in Solidity:
```solidity
constructor(uint[2][3] memory myNestedArray) { ... }
```

In your Sphinx config file:
```ts
myNestedArray: [
  [1, 2, 3],
  [4, 5, 6]
]
```

### Multi nested array

Define your array in Solidity:
```solidity
constructor(uint[1][2][3] myMultiNestedArray) { ... }
```

In your Sphinx config file:
```ts
myMultiNestedArray: [[[1, 2, 3], [4, 5, 6]]]
```

### Dynamic arrays

You can define dynamic arrays in your Sphinx config file using the same exact format as [fixed size arrays](#arrays).

## Structs

Define your struct in Solidity:
```solidity
struct MyStruct {
  bool a;
  string b;
  uint256 c;
}

MyStruct myStruct;

constructor(MyStruct memory _myStruct) { ... }
```

In your Sphinx config file:
```ts
_myStruct: {
  a: true,
  b: 'myString',
  c: 123
}
```

### Complex structs

Define your struct in Solidity:
```solidity
struct ComplexStruct {
  int myInt;
  uint[2][3] myArray;
}

ComplexStruct complexStruct;

constructor(ComplexStruct memory _complexStruct) { ... }
```

In your Sphinx config file:
```ts
_complexStruct: {
  myInt: -1,
  myArray: [
    [1, 2, 3],
    [4, 5, 6]
  ]
}
```

## [User-Defined Value Types](https://docs.soliditylang.org/en/latest/types.html#user-defined-value-types)

Sphinx treats your user defined types as if they were their underlying types.

Define your type in Solidity
```solidity
type UserDefinedType is uint256;
UserDefinedType public userDefined;

constructor(UserDefinedType _userDefined) { ... }
```

In your Sphinx config file:
```ts
_userDefined: 1
```
