# Overview of the Sphinx DevOps Platform

Deployments are a three-step process with the DevOps platform.

1. **Propose**: The deployment is proposed on the command line or in a CI process. This creates a meta transaction that's signed by the proposer's private key then relayed to Sphinx's back-end. We recommend creating a new private key to use specifically for proposals, since the private key will either be stored in a `.env` file or as a secret in your CI process.
2. **Fund**: With Sphinx, you don't need to handle native gas tokens for your deployments. Instead, you'll cover the cost of your deployments by depositing USDC into a `SphinxBalance` contract. On production networks, you'll fund your deployments on Optimism Mainnet. Likewise, on testnets, you'll fund your deployments on Optimism Goerli. We'll provide you with free USDC on Optimism Goerli to fund your deployments on testnets.
3. **Approve**: The project owner(s) sign a meta transaction to approve the deployment in the Sphinx UI.

After the deployment has been approved by the project owners, it's executed on-chain by Sphinx's backend. In order to execute the deployment, Sphinx must submit proof of the meta transaction signed by the proposer and the owners.
