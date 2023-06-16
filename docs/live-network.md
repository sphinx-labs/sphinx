# Using ChugSplash on Live Networks

Using ChugSplash to deploy or upgrade contracts on live networks is generally the same as using ChugSplash locally. The only difference is that you'll need to perform a few additional configurations. You'll find instructions for both Foundry and Hardhat users listed below.

- [Foundry](#Foundry)
- [Hardhat](#Hardhat)


## Foundry

### Update your foundry.toml file
First you'll need to update your `foundry.toml` file to add an RPC url mapping for the network you would like to target.

For example, to target the goerli network you would want to add the following:
```
[rpc_endpoints]
goerli = "<rpc url>"
```

The mappings you add may vary depending on which networks you'd like to target. Feel free to configure mappings for as many networks as you'd like. Learn more about the Foundry rpc url mappings in the [official Foundry documentation](https://book.getfoundry.sh/reference/config/testing?highlight=%5Brpc_endpoints%5D#rpc_endpoints).

### Update your environment variables
Then you'll need add a few environment variables in your `.env` file.

If you haven't already created a `.env` file in the root of your project, you should do so now. Inside the `.env` file, copy and paste the following variables:

```
# Required variables
PRIVATE_KEY=
NETWORK=

# Optional variables
SKIP_STORAGE_CHECK=
NEW_OWNER=
WITHDRAW_FUNDS=
```

Descriptions for these variables are listed below.

### Required variables

* `PRIVATE_KEY`: Private key of the deployer.
* `NETWORK`: Network to deploy onto. This should correspond to an RPC url mapping in your `foundry.toml` file. For example: `'goerli'`
* `IPFS_PROJECT_ID` and `IPFS_API_KEY_SECRET`: IPFS credentials. We recommend getting these on [Infura](https://app.infura.io/).

### Optional variables

If you leave an optional variable empty, ChugSplash will use its default value.

* `SKIP_STORAGE_CHECK` (`boolean`): Set this to `true` to upgrade your project without using the storage layout safety checker. Only set it to `true` when you're confident that the upgrade won't lead to storage layout issues.
  * Default value: `false`
* `NEW_OWNER` (`address`): Address that will receive ownership of the project after the deployment/upgrade is executed.
  * Default value: Address corresponding to the `PRIVATE_KEY` environment variable.
* `WITHDRAW_FUNDS` (`boolean`): Set this to `false` if you'd like to skip withdrawing leftover funds at the end of the deployment/upgrade to reduce the number of transactions in future upgrades for the project.
  * Default value: `true`

### Executing the deployment or upgrade

Then to perform your deployment, simply run:
```
forge script --rpc-url <rpcUrl> <path/to/script>
```

## Hardhat

### Update your environment variables
You'll need add a few environment variables in your `.env` file.

If you haven't already created a `.env` file in the root of your project, you should do so now. Inside the `.env` file, copy and paste the following variables:

```
# Required variables
PRIVATE_KEY=
```

Descriptions for these variables are listed below.

### Required variables

* `PRIVATE_KEY`: Private key of the deployer.

### Update your hardhat.config.js file
Then you'll need to update your `hardhat.config.js` file to add configurations for the network(s) you would like to target. If you are familiar with Hardhat, these configurations are exactly the same.

For example, to target the goerli network you would want to add the following configuration:
```
goerli: {
  chainId: 5,
  url: "<rpc url>",
  accounts: [process.env.PRIVATE_KEY],
}
```

The configurations you add may vary depending on which networks you'd like to target. Feel free to configure as many networks as you'd like.

### Executing the deployment or upgrade

Then to perform your deployment, simply run:
```
npx hardhat chugsplash-deploy --network <network name> --config-path <path/to/chugsplash/file>
```
