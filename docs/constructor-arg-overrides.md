# Default Constructor Args & Chain-specific Overrides
Since with Sphinx, you can trigger deployments across multiple networks at once, there may be cases where you need to define different constructor arguments for different networks. For example, you may need to define a different fee level or specify a different set of addresses for third-party contracts that your system integrates with.

To handle these cases, Sphinx allows you to define two types of constructor arguments in your config file: default constructor arguments and chain-specific overrides.

## Default Arguments
Default constructor arguments can be defined using the `constructorArgs` field on your contract definitions like you may have seen in previous guides:
```
constructorArgs: {
  myArgument: 1
}
```

Default constructor arguments will be used automatically when deploying this contract on any chain where there are no constructor argument overrides.

## Chain-specific Overrides
Chain-specific overrides can be defined using the `overrides` field on your contract definitions. The `overrides` field accepts an array of override objects:
```
constructorArgs: {
  feePercentage: 10
}
overrides: [
  {
    chains: ['arbitrum', 'optimism'],
    constructorArgs: {
      feePercentage: 50
    }
  },
  {
    chains: ['ethereum'],
    constructorArgs: {
      feePercentage: 3
    }
  }
]
```

Chain-specific overrides give you a great deal of flexibility in how you define your constructor arguments. In the above example, we've defined the default `feePercentage` to be 10. On Arbitrum and Optimism, we've set it to 50, and on Ethereum 3. When we deploy using this config, Sphinx will automatically select the correct constructor argument based on the target chain(s).

There are a few rules you must follow when defining your chain-specific overrides, or Sphinx will output a validation error when you attempt to deploy:
- Every constructor argument must have a default value.
- Constructor arguments cannot have more than 1 override for each chain.
