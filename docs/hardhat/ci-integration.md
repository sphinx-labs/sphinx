# Using Sphinx in CI with Hardhat and Sphinx Managed

This is a basic guide on how to integrate Sphinx into your CI process using GitHub actions to trigger a deployment
on goerli whenever you push a change to the main branch of your repo. If you are using a different CI platform, this guide
will still be approximately accurate, but the exact configuration of the CI provider may be different. This guide is tailored to Hardhat users, if you are using Foundry then you should check out the [Foundry version of this guide](https://github.com/sphinx-labs/sphinx/blob/develop/docs/foundry/ci-integration.md).

## Create a Github Actions Folder
`mkdir -p .github/workflows`

## Create a new workflow deploy.yml
`touch .github/workflows/deploy.yml`

## Paste in the following action template
```
name: Deploy Contracts
env:
    PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}
    IPFS_PROJECT_ID: ${{ secrets.IPFS_PROJECT_ID }}
    IPFS_API_KEY_SECRET: ${{ secrets.IPFS_API_KEY_SECRET }}
    SPHINX_API_KEY: ${{ secrets.SPHINX_API_KEY }}
    ALCHEMY_API_KEY: ${{ secrets.ALCHEMY_API_KEY }}
on:
  push:
    branches:
      - main
jobs:
  sphinx-propose:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: yarn install
      - run: npx hardhat sphinx-propose --config-path <path to Sphinx config> --network goerli --confirm
```

The key part of this is the `sphinx-propose` command which is what initiates the deployment using Sphinx. If you are using a different CI provider, you'll just need to ensure this command is properly run.

Note that in this example, we've also included an Alchemy API key and installed the projects dependencies using yarn. These may be different for your project depending one what node provider you are using and your chosen package manager.

## Add the required secret repository variables to you Github Actions settings
* `PRIVATE_KEY`: The private key of an EOA you'd like to use to trigger deployments. This must be the same as the one you used to register the organization, and should be set as the default account in your hardhat config file.
* `IPFS_PROJECT_ID` and `IPFS_API_KEY_SECRET`: IPFS credentials. We recommend getting these on [Infura](https://app.infura.io/).
* `SPHINX_API_KEY`: Find this on the Sphinx dashboard after registering your organization.

## Update your hardhat.config.js file
You'll need to update your `hardhat.config.js` file to add configurations for the network you would like to target. If you are familiar with Hardhat, these configurations are exactly the same.

For example, to target the goerli network you would want to add the following configuration:
```
goerli: {
  chainId: 5,
  url: "<rpc url>",
  accounts: [process.env.PRIVATE_KEY],
}
```

Note: At this time, Sphinx Managed only supports Goerli. If you would like support for different networks please let us know in the Discord.

## Make sure your Org Id is correct
You'll find your Sphinx organization Id on the Sphinx dashboard of the website. You'll want to copy it and make sure that you are using it in your Sphinx config file.

## Test your integration
Test out your integration by pushing to main to trigger a deployment. You should see your project show up on the website shortly
and be able to fund and approve it for deployment. If you run into any issues integrating your project with Sphinx, please
feel free to ask questions in the Discord: https://discord.gg/HefaZbcvaK.
