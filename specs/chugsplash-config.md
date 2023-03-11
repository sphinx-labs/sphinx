# ChugSplash Config Specification
ChugSplash config files may be written in Javascript, Typescript, or JSON. For Javascript and Typescript users, their config file must have a default export that is either a valid ChugSplash config object or an asynchronous function which resolves to a valid ChugSplash config object. JSON users may only export a valid ChugSplash config object. The rest of this document outlines what a valid config file is.

> Note that when using the ChugSplash Foundry library, users are limited to either Javascript or JSON.

# Table of Contents
- [Contract Config Definitions](#contract-config-definition)
- [Contract Constructor Arguments](#contract-constructor-args)
- [Signed & Unsigned Integers](#signed--unsigned-integers)
- [Booleans](#booleans)
- [Addresses](#addresses)
- [Contracts](#contracts)
- [Strings](#strings)
- [Enums](#enums)
- [User-defined Types](#user-defined-types)
- [Fixed-size bytes](#fixed-size-bytes-arrays)
- [Dynamically-sized bytes](#dynamically-sized-bytes)
- [Fixed Size Arrays](#fixed-size-arrays)
- [Dynamically-sized Arrays](#dynamically-sized-arrays)
- [Mappings](#mappings)
- [Structs](#structs)
- [Arbitary Nested Types](#arbitary-nested-types)

## Options
- Project name
- todo spec out other project options

## Contracts Config Field
JSON or Javascript object defining the contracts that should be deployed. Each key is a contracts reference name and its value is a contract definition.

> Reference names are used internally by ChugSplash to identify specific instances of contracts. Each combination of a project name and contract reference name should be unique within the ChugSplash system.

## Contract Config Definition
JSON or Javascript object defining a contract to be deployed, it's constructor args, and variable definitions. Contract definitions must conform to the following format:

```js
ReferenceName: {
  contract: 'LiteralContractName',
  constructorArgs: {},
  variables: {}
}
```

## Contract Constructor Args
A JSON or Javascript object defining a set of constructor args. All constructor arguements are required to be immutable variables...

TODO finish defining constructor args spec

## Contract Variables
A JSON or Javascript object defining a set of ChugSplash input variables. ChugSplash is designed to remove the need for constructors or initializers by allowing the user to define the value of their variables directly during the deployment process. To ensure this process works reliably we perform input validation during the bundling process. Below we define the expected valid types. All other input types should be caught and rejected.

Note that ChugSplash config files may be written in Javascript and therefore users are able to take advantage of various Javscript features and libraries to fetch values to be used in their ChugSplash config files.

## Preserve
Any variable may use the '{ preserve }' keyword which maintains the currently value of the variables storage slot. For more information on preserve, see the [Special Variable Definitions documentation](https://github.com/chugsplash/chugsplash/blob/develop/docs/special-var-defs.md#preserve-keyword).

## Signed & Unsigned integers
For both signed and unsigned integers, we allow three valid input types:
- Base 10 string numbers: "1", "10", "1000000000000000000", "-100"
- Base 10 literal numbers: 1, 10, 100, -100
- [BigNumbers](https://docs.ethers.org/v5/api/utils/bignumber/)

We enforce valid input ranges based on the specific byte size and sign of the target solidity variable. For example, if a variable is defined as uint8, we expect that values outside the range 0:255 to be caught and rejected during our bundling process. Likewise for int8, we expect that values outside the range -127:128 would be caught and rejected.

Note that we explicitly do not support alternative base inputs such as hexadecimal for uint and int.

### Examples
```js
// Solidity
uint public x;

// Javascript
x: "1",
```

```js
// Solidity
uint public x;

// Javascript
x: 1,
```

```js
// Solidity
int public x;

// Javascript
x: -1,
```

```js
// Solidity
int public x;

// Javascript
x: "-1",
```

## Booleans
For booleans, we only allow literal Javascript or JSON booleans.

### Examples
```js
// Solidity
boolean public x;
boolean public y;

// Javascript
x: true,
y: false,
```

## Addresses
For addresses, we only accept 20 byte [DataHexStrings](https://docs.ethers.org/v5/api/utils/bytes/#DataHexString).

### Example
```js
// Solidity
address public x;

// Javascript
x: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
```

## Contracts
For contracts, we accept two possible input types:
- 20 byte [DataHexStrings](https://docs.ethers.org/v5/api/utils/bytes/#DataHexString)
- ChugSplash contract references

ChugSplash contract references are a format that allows users to reference other contracts deployed using ChugSplash. Our offchain tooling converts these references into the underlying contract address using Create2.

Valid contract references must reference contracts in the same ChugSplash project and use the following format:
```
{{ <Contract Reference Name> }}
```

### Example
```js
// Solidity
Contract public contractReference;

// Javascript
const config: UserChugSplashConfig = {
  // Configuration options for the project:
  options: {
    projectName: 'My Project',
  },
  contracts: {
    Contract: {
      contract: 'Contract',
      ...
    },
    OtherContract: {
      contract: 'SomeOtherContract',
      variables: {
        contractReference: '{{ Contract }}',
      },
    },
  },
}
```

## Strings
For strings, we allow only unicode string literals.
Note that if you supply a hex value in string format, we will not interpret it as a bytes value. We will encode it as if it were any other string.

### Example
```js
// Solidity
string public x;

// Javascript
x: 'literalString',
```

## User Defined Types
We treat user defined types as if they were their underlying value type. We expect the input format to match the expected format of the underlying value type.

### Example
```js
// Solidity
type UserDefinedType is uint256;
UserDefinedType public x;

// Javascript
x: 1,
```

## Enums
For enums, we accept only positive integers that correspond to a valid value for the Solidity enum.
I.e we accept only enum input values N where 0 <= N < type(SolidityEnumName).max

Note that Typescript users may choose to use Typescript enums as input values and we expect this to work. Typescript also uses integers as the underlying value for their enums which means at runtime they conform to the above input specification.

### Examples
```js
// Solidity
enum TestEnum { A, B, C }
TestEnum public standardEnum;
TestEnum public typescriptEnum;

// Typscript Enum
const enum TestEnum {
  'A',
  'B',
}

// Config vars
standardEnum: 0,
typescriptEnum: TestEnum.B,
```

## Fixed-size Bytes Arrays
For fixed sized bytes arrays, we only allow exactly 32 byte [DataHexStrings](https://docs.ethers.org/v5/api/utils/bytes/#DataHexString).

### Examples
```js
// Solidity
bytes32 public x;

// Javascript
x: '0x1111111111111111111111111111111111111111111111111111111111111111',
```

## Dynamically-sized Bytes
For dynamic bytes, we accept arbitary length [DataHexStrings](https://docs.ethers.org/v5/api/utils/bytes/#DataHexString).

### Example
```js
// Solidity
bytes public x;

// Javascript
x: '0xabcd1234',
```

## Fixed-size Arrays
For fixed length arrays, we accept JSON or JS arrays of exactly the defined length. The underlying array element types are validated individually and are expected to match the same input format as the corresponding value types.

### Example
```js
// Solidity
uint8[5] public x;

// Javascript
x: [1, 2, 3, 4, 5],
```

## Dynamically-sized Arrays
For dynamic arrays, we accept JSON or JS arrays of arbitrary lengths. Like fixed length arrays, we perform validation on the underlying array elements individually.

### Examples
```js
// Solidity
int[] public x;

// Javascript
x: [1, -1, "1", "1000000000000000000"],
```

```js
// Solidity
int[][] public x;

// Javascript
x: [
  [1, 2, 3, 4],
  [-1, -2, -3, -4],
]
```

## Mappings
For mappings, we accept a JSON or JS object where the object keys and values correspond to the mapping keys and values. The keys and values are validated individually and expected to match the same input format as their corresponding value types.

Note that negative int keys must be defined using a string as a side effect of how JS and JSON treat objects.

### Examples
```js
// Solidity
mapping(string => uint) public mapping;

// Javascript
mapping: {
  a: 1,
}
```

```js
// Solidity
mapping(uint => uint) public mapping;

// Javascript
mapping: {
  1: 1,
}
```

```js
// Solidity
mapping(int => uint) public mapping;

// Javascript
mapping: {
  '-1': 1,
}
```

## Structs
For structs we also accept a JSON or JS object. The keys and values correspond to the structs keys and values. Struct keys are expected to always be valid strings, but they do not need to be wrapped in quotes. Like arrays and mappings, struct values are validated individually and expected to match the expected input format of their underlying value types.

### Example
```js
// Solidity
struct SimpleStruct { bytes32 a; uint128 b; uint128 c; }
SimpleStruct public x;

// Javascript
x: {
  a: ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32),
  b: 12345,
  c: 54321,
}
```

## Arbitary Nested Types
We use recursive logic to handle arbitrarily nested types. We expect that any nested combination of input types defined above would be valid as long as each piece of such a type is individually valid.

### Examples
```js
// Solidity
struct ComplexStruct {
    int32 a;
    mapping(uint32 => string) b;
}
ComplexStruct public x;

// Javascript
x: {
  a: 4,
  b: {
    5: 'value',
  },
}
```

```js
// Solidity
mapping(uint8 => mapping(string => mapping(address => uint))) public x;

// Javascript
multiNestedMapping: {
  1: {
    testKey: {
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266': 2,
    },
  },
},
```

