# Defining Variables in a ChugSplash File

This is a reference that explains how to assign values to every variable type in a ChugSplash config file.

## Table of Contents

- [Booleans](#booleans)
- [Unsigned Integers](#unsigned-integers-uint)
- [Signed Integers](#signed-integers-int)
- [Addresses](#addresses)
- [Contracts](#contracts)
- [Fixed-size bytes](#fixed-size-bytes-bytes1-bytes2--bytes32)
- [Dynamically-sized bytes](#dynamically-sized-bytes)
- [Strings](#strings)
- [Unicode strings](#unicode-strings)
- [Hexadecimal literals](#hexadecimal-literals)
- [Enums](#enums)
- [Arrays](#arrays)
- [Structs](#structs)
- [Mappings](#mappings)
- [User-Defined Value Types](#user-defined-types)


## Booleans

```ts
myBool: true
```

## Unsigned Integers

```ts
myUint: 123
```

## Signed Integers

```ts
myInt: -123
```

## Addresses

```ts
myAddress: '0x1111111111111111111111111111111111111111'
```

## Contracts

You define a contract variable the same way that you define an address.

Say you have a contract variable in Solidity called `MyToken`:
```sol
MyToken public myToken;
```

In your ChugSplash config file:
```ts
myContract: '0x2222222222222222222222222222222222222222'
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

## Hexadecimal literals

```ts
myHexLiteral: '0xaa'
```

## Enums

### TypeScript

Define your Enum in TypeScript:
```ts
const enum MyEnum {
  'A', 'B', 'C',
}
```

In your ChugSplash config file:
```ts
myEnum: MyEnum.B
```

### JavaScript

In your ChugSplash config file:
```js
myEnum: 1 // equivalent to MyEnum.B
```

## Arrays

```ts
myArray: [1, 2, 3]
```

### Nested arrays

Define your array in Solidity:
```solidity
uint[2][3] myNestedArray;
```

In your ChugSplash config file:
```ts
myNestedArray: [
  [1, 2, 3],
  [4, 5, 6]
]
```

### Multi nested array

Define your array in Solidity:
```solidity
uint[1][2][3] myMultiNestedArray;
```

In your ChugSplash config file:
```ts
myMultiNestedArray: [[[1, 2, 3], [4, 5, 6]]]
```

### Dynamic arrays

You can define dynamic arrays in your ChugSplash config file using the same exact format as [fixed size arrays](#arrays).

## Structs

Define your struct in Solidity:
```solidity
struct MyStruct {
  bool a;
  string b;
  uint256 c;
}

MyStruct myStruct;
```

In your ChugSplash config file:
```ts
myStruct: {
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
```

In your ChugSplash config file:
```ts
complexStruct: {
  myInt: -1,
  myArray: [
    [1, 2, 3],
    [4, 5, 6]
  ]
}
```

## Mappings

Define your mapping in Solidity:
```solidity
mapping(string => uint) myStringMapping;
```

In your ChugSplash config file:
```ts
myStringMapping: {
  'firstString': 1,
  'secondString': 2,
  ...
}
```

> Note: You may define an empty mapping using the syntax `{}`.

### Mappings with signed integer keys

Define your mapping in Solidity:
```solidity
mapping(int => string) myIntMapping;
```

In your ChugSplash config file:
```ts
myIntMapping: {
  '-1': 'firstStringVal',
  1: 'secondStringVal',
  ...
}
```

### Mappings with struct values

Define your struct and mapping in Solidity:
```solidity
struct MyStruct {
  bool a;
  string b;
  uint256 c;
}

mapping(string => MyStruct) myStructMapping;
```

In your ChugSplash config file:
```ts
myStructMapping: {
  'firstString': {
    a: true,
    b: 'firstStringMember',
    c: 1,
  },
  'secondString': {
    a: false,
    b: 'secondStringMember',
    c: 2,
  },
  ...
},
```

### Nested mappings

Define your mapping in Solidity:
```solidity
mapping(string => mapping(uint => address)) myNestedMapping;
```

In your ChugSplash config file:
```ts
myNestedMapping: {
  'firstString': {
    1: '0x1111111111111111111111111111111111111111',
    2: '0x2222222222222222222222222222222222222222',
    ...
  },
  'secondString': {
    3: '0x3333333333333333333333333333333333333333',
    4: '0x4444444444444444444444444444444444444444',
    ...
  },
  ...
}
```

### Multi nested mappings

Define your mapping in Solidity:
```solidity
mapping(uint => mapping(string => mapping(bytes => uint))) myMultiNestedMapping;
```

In your ChugSplash config file:
```ts
myMultiNestedMapping: {
  1: {
    'firstString': {
      '0xaa': 1,
      '0xbb': 2,
      ...
    },
    'secondString': {
      '0xcc': 3,
      '0xdd': 4,
      ...
    }
  },
  2: {
    'thirdString': {
      '0xee': 5,
      ...
    },
    ...
  },
  ...
},
```

## [User-Defined Value Types](https://docs.soliditylang.org/en/latest/types.html#user-defined-value-types)
ChugSplash treats your user defined types as if they were their underlying types.

Define your type in Solidity
```solidity
type UserDefinedType is uint256;
UserDefinedType public userDefined;
```

In your ChugSplash config file:
```ts
userDefined: 1
```
