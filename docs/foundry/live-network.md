# Using ChugSplash on Live Networks

Using ChugSplash to deploy or upgrade contracts on live networks is generally the same as using ChugSplash locally. The only difference is that you'll need to fill out a few configuration variables in your `.env` file.

If you haven't already created a `env` file in the root of your project, you should do so now. Inside the `.env` file, copy and paste the following variables:

```
# Required variables
PRIVATE_KEY=
NETWORK=
IPFS_PROJECT_ID=
IPFS_API_KEY_SECRET=

# Optional variables
SKIP_STORAGE_CHECK=
NEW_OWNER=
WITHDRAW_FUNDS=
```

Descriptions for these variables are listed below.

## Required variables

* `PRIVATE_KEY`: Private key of the deployer.
* `NETWORK`: Network to deploy onto. For example: `'goerli'`
* `IPFS_PROJECT_ID` and `IPFS_API_KEY_SECRET`: IPFS credentials. We recommend getting these on [Infura](https://app.infura.io/).

## Optional variables

If you leave an optional variable empty, ChugSplash will use its default value.

* `SKIP_STORAGE_CHECK` (`boolean`): Set this to `true` to upgrade your project without using the storage layout safety checker. Only set it to `true` when you're confident that the upgrade won't lead to storage layout issues.
  * Default value: `false`
* `NEW_OWNER` (`address`): Address that will receive ownership of the project after the deployment/upgrade is executed.
  * Default value: Address corresponding to the `PRIVATE_KEY` environment variable.
* `WITHDRAW_FUNDS` (`boolean`): Set this to `false` if you'd like to skip withdrawing leftover funds at the end of the deployment/upgrade to reduce the number of transactions in future upgrades for the project.
  * Default value: `true`

## Executing the deployment or upgrade

Once you've filled out the `.env` file, simply run `forge script --rpc-url <rpcUrl> <path/to/script>`.