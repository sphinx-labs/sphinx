# Deploy from the CLI

Sphinx has a CLI command for executing deployments from your local machine without using the DevOps Platform. There are two main reasons to use it:

1. Deploy on Anvil. Sphinx will broadcast the deployment even if you aren't one of the Gnosis Safe owners.
2. Deploy on live networks. This can be useful if you'd like to deploy a Gnosis Safe and generate deployment artifacts. Since you aren't using the DevOps Platform, you'll need native gas tokens for the deployment, and you'll need an Etherscan API key to verify your contracts. Note that you can only deploy from the CLI on live networks if you're the only owner of the Gnosis Safe.

You can execute a Forge script on a network using the `deploy` command.

Using Yarn or npm:

```
npx sphinx deploy <path/to/your/script.s.sol> --network <network_name>
```

Using pnpm:

```
pnpm sphinx deploy <path/to/your/script.s.sol> --network <network_name>
```

The following steps will occur when you run this command:

1. The command will simulate the deployment by invoking the script's `run()` function on a fork of the specified network. It will collect the broadcasted transactions.
2. Sphinx will display the collected transactions in a preview, which you'll be prompted to confirm. You can skip the preview by including a `--confirm` flag when you run the command.
3. Foundry will broadcast the transactions on the target network through your Gnosis Safe.
4. Sphinx will write deployment artifacts to your file system. See the [Deployment Artifacts](https://github.com/sphinx-labs/sphinx/blob/main/docs/docs/deployment-artifacts.md) guide for more information.
5. (Optional): You can verify contracts on Etherscan by including a `--verify` flag.
