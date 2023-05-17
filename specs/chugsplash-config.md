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

# Options
There are three config option fields `organizationID`, `claimer`, and `projectName`. Each of these values impacts the addresses of contracts deployed using ChugSplash. All three of these fields are required for ChugSplash to uniquely identify the correct organization, project, and contract when performing a deployment or upgrade.

### Organization Id
A 32 byte string which identifies the organization that the relevant ChugSplash config is a part of. Each organization gets a unique ChugSplashManager contract which manages deployments for their organization. Users of the ChugSplash managed service have an organization id recommended to them, but other users can just generate and use any arbitrary 32 byte string.

You can think of the organization id as identifying the toplevel address space of the users organization.

## Project Name
An abitrary name string which identifies a specific project within an Organization. Project names are unique within each organization. If you create multiple configs in the same organization that use the same project name, then they will be treated like they are part of the same project when you perform deployments. We recommend that project names not be shared between multiple config files.

You can think of the project name as identifying a subsection of the address space of the organization that the project is a part of. Project names allow ChugSplash to reuse the same ChugSplashManager within an organization while avoid the possibility of different projects deployments and upgrades impacting each other.

## Claimer
The address of the wallet used to claim the organization on chain. Since ChugSplash deterministically deploys contracts to the same addresses across chains, we have to account for the possibility that a malicious third party could attempt to snipe the contract addresses of well know protocols on chains they have not deployed to yet. To avoid this attack vector, we use the address of the claimer wallet as the final element in determining the address of the ChugSplash manager. This makes it impossible to snipe a ChugSplash users contract address without owning the account used to claim the organization.

# Contracts Config Field
JSON or Javascript object defining the contracts that should be deployed. Each key is a contracts reference name and its value is a contract definition.

> Reference names identify specific instances of contracts in the ChugSplash system. Each combination of a project name and contract reference name identifies a unique contract within an organization.

# Contract Config Definition
JSON or Javascript object defining a contract to be deployed, it's constructor args, variable definitions, and other options.

Contract definitions may include the following fields:
- contract
- variables
- constructorArgs
- externalProxy
- kind
- previousBuildInfo
- previousFullyQualifiedName
- unsafe

## Contract
The name of the contract to be deployed.

## Variables
A set of state variables for the contract. See [Contract Variables](#contract-variables) for more information.

## Constructor Arguments
A set of constructro arguments for the contract. See [Contract Constructor Arguments](#contract-constructor-arguments) for more information.

## External Proxy
If this contract was initially deployed behind a proxy using a different tool. The user may define the proxy address using this field. Note that when using an external proxy, the user is expected to also define the `previousBuildInfo`, `previousFullyQualifiedName`, and `kind` fields which provide us with additional information necessary for working with external proxy types.

## Kind
An optional field defining the type of contract:
- no-proxy: A stateless immutable contract to be deployed without a proxy
- standard-transparent: Standard transparent proxies not deployed using OpenZeppelin.
- oz-transparent: An OpenZeppelin transparent proxy
- oz-ownable-uups: An OpenZeppelin UUPS proxy using Ownable
- oz-access-control-uups: An OpenZeppelin UUPS proxy using Access Control

## Previous Build Info
A path to a build info file generated for a previous version of a contract that has already been deployed. This field needs to be defined when upgrading a contract that uses a proxy which was deployed outside of ChugSplash. Providing the previous build info allows us to run our storage slot checker

## Previous Fully Qualified Name
The fully qualified name of a contract that has been deployed outside of ChugSplash. This field needs to be defined along with the previous build info and is used to run the storage slot checker against the previous contract version.

## Unsafe
ChugSplash performs a variety of safety checks before deploying/upgrading contracts. Users may override these safety checks using this field if their situation requires it. The unsafe field is a JSON or JS object containing a set of fields which disable different safety checks including:
- skipStorageCheck: Fully disable the storage slot checker
- allowRenames: Allow renaming state variables
- allowDelegatecall: Allow use of delegatecall in implementation contracts
- allowSelfdestruct: Allow use of selfdestruct
- allowMissingPublicUpgradeTo: Allow upgrading to a contract that does not include an upgradeTo function (only relevant to contracts using external UUPS proxies)
- allowEmptyPush: Allow the use of the empty push function: `push()` which ChugSplash disallows due to potential ambiguity of the values in dynamic arrays if the function is used.

# Contract Constructor Arguments
We support providing a set of constructor arguements for each contract. We only support this because it is necessary to support the use of immutable variables. Therefore  all constructor arguements are required to be used by the constructor to set immutable variables in the target contract. If any logic is detected in the constructor that is not related to setting immutable variables than we thow an error. All other variables are expected to be set in the ChugSplash config file using the variable format defineed below.

For constructor arguments we accept a JSON or Javascript object defining a set of constructor arguments. Since constructor arguments are expected to only be used to set immutable variables, we support all value types except for function types. For all of those types, we expect the same input format as the corresponding variable input format defined below.

Note that for addresses, we support the use of contract references in constructor arguments as long as the target contract is proxied. We do not support contract references in the constructor arguements of non-proxied contracts.

# Contract Variables
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

### Examples
```js
// Solidity
enum TestEnum { A, B, C }
TestEnum public x;

// Config vars
x: 0,
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
