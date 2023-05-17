# Special Variable Definitions

This section explains how to define special variables in your ChugSplash config file.

## Table of Contents

- [Contract References](#contract-references): Refer to a contract or its address using its reference name.
- [Preserve Keyword](#preserve-keyword): Prevent the value of a variable from being overwritten during an upgrade.

## Contract References

You can use a [contract's reference name](https://github.com/chugsplash/chugsplash/blob/develop/docs/chugsplash-file.md#contract-definitions) to refer to a contract's instance or its address in your ChugSplash config file.

```ts
myToken: "{{ MyToken }}" // The MyToken contract or its address
```

Contract references can be used for variables of type `address`, `address payable`, or contract instances (e.g. `MyToken`).

Contract definitions are case sensitive. For example, if you have a contract called `MyToken`, the following is NOT valid:

```ts
myToken: "{{ MYTOKEN }}"
```

Any amount of whitespace is allowed between the brackets. For example, the following is valid:

```ts
myToken: "{{MyToken              }}"
```

## Preserve Keyword

During an upgrade, you may want to leave the values of some variables untouched. For example, if you have a `counter` variable that's incremented every time a user performs an action, you probably won't want to overwrite its existing value since it can change at any time. To prevent its value from being overwritten, use the preserve keyword:

```ts
counter: '{ preserve }'
```

You can use the preserve keyword for members of complex data types. For example, say you have the following struct in your contract:

```sol
struct MyStruct {
  uint256 a;
  bool b;
  string c;
}

MyStruct public myStruct;
```

If you want to preserve the value of its member `a`, you can set it to the preserve keyword while assigning values to the other members:

```ts
myStruct: {
  a: "{ preserve }",
  b: true,
  c: "MyString",
}
```

The preserve keyword works for arbitrarily nested variables.

Using the preserve keyword will cause ChugSplash to omit the `SetStorage` action for the variable (or its member). This means ChugSplash will not modify its value when it upgrades the contract.

You can only use the preserve keyword for state variables that have the same exact type and storage slot position (i.e. storage slot key and offset) in the original contract and its upgraded version. Additionally, you can only use the keyword when upgrading a contract (not for a fresh deployment). Lastly, you cannot use the preserve keyword for immutable variables. If any of these conditions aren't met, ChugSplash will throw an error when compiling your ChugSplash config file.

The preserve keyword is not case sensitive, and allows whitespace. In other words, the following variations of the preserve keyword are valid:
```
'{preserve}',
"{ PrEsErVe       }"
```
