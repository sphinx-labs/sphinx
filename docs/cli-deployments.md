# Deploying on Anvil

Sphinx has its own CLI command for broadcasting deployments onto Anvil. You can run it with this command, replacing `<path/to/your/script.s.sol>` with the path to your deployment script:

```
npx sphinx deploy <path/to/your/script.s.sol> --network anvil
```

The following steps will occur when you run this command:

1. The command will simulate the deployment by invoking the script's `run()` function on a fork of the specified network. It will collect the transactions in the `run()` function.
2. The collected transactions will be displayed in a preview, which you'll be prompted to confirm. You can skip the preview by including a `--confirm` flag when you run the command.
3. Your transactions will be broadcasted on Anvil through your Gnosis Safe.
4. Deployment artifacts will be written to the file path: `./deployments/anvil-<chain_id>/<ContractName>.json`.

> Tip: Before you run the command, make sure you've added Anvil to the `rpc_endpoints` section in your
> `foundry.toml`. For example:
> ```toml
> [rpc_endpoints]
> anvil = "http://127.0.0.1:8545"
> ```

