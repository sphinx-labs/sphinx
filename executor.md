# The `executor` Merkle leaf field

I think we should remove the `executor` field from the Merkle tree. This means anybody will be able to execute a user's deployment.

I don't think removing this field meaningfully changes the trust assumptions that the user places on the executor. You can read about these trust assumptions in the `SphinxModuleProxy` spec for [buggy executors](https://github.com/sphinx-labs/sphinx/blob/develop/specs/sphinx-module-proxy.md#buggy-executor) and [malicious executors](https://github.com/sphinx-labs/sphinx/blob/develop/specs/sphinx-module-proxy.md#malicious-executor).

Removing this field would introduce the possibility of one edge case, which could add complexity to the relayer. Specifically, it'll be possible for anybody to front-run our relayer's transactions, causing them to error. Here's how this could happen:
1. We submit a transaction to the mempool at the same time that somebody else submits a transaction to execute the same set of Merkle leaves.
2. Their transaction gets accepted first, causing an error in the Sphinx Module for our transaction, which will bubble up to the relayer.

I don't think this edge case is likely to happen, but I'm not sure whether our relayer can recover gracefully from this.

If you'd like to understand the rationale for removing this field, read the next section.

## Rationale

If we keep the `executor` field, the following griefing risk can occur, which would significantly degrade the UX of the arbitrary chain feature:
1. Say we leak the private key of the account that owns the `ManagedService`.
2. An attacker could take control of the `ManagedService` by changing its owner and removing all of our relayers. This will prevent us from executing any transactions through the `ManagedService`.
3. The attacker could grief users of the arbitrary chain feature in a variety of ways. Here's a non-exhaustive list, which should hopefully give you a sense of the headache this would cause:
  * The attacker could make a deployment active, which would require us to create a new Merkle tree with a `CANCEL` leaf. After this new Merkle root is signed, the attacker could finish executing the deployment, invalidating the new Merkle root.
  * The attacker could partially execute deployments on different chains to varying degrees. For example, it could execute half of a deployment on Chain A and three-quarters of a deployment on Chain B. This could make it infeasible for the user to sign a single new Merkle root.
    * If the user's deployment uses `CREATE`, the attacker could make it difficult for the user to get consistent addresses by partially executing deployments.
    * The user could theoretically switch to a new Gnosis Safe, but that would also cause inconsistent addresses across networks if the user deploys via `CREATE` and has already executed deployments on some chains.
