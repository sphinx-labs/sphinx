How should we migrate existing users to the newest version of the Sphinx Module?

This decision is likely to impact the migration process for future versions of the Sphinx Module.

## Options

My most preferred solution is option 3, then 2, then 1.

1. Get the user to sign an arbitrary chain Merkle root that migrates to the new Module version.

This solution is convenient, but the security profile makes me uneasy. For example, say we discover that the new Sphinx Module has a security vulnerability that allows anyone to execute transactions through it. We can mitigate this threat on existing networks by quietly patching the vulnerability in a new Sphinx Module, then privately telling our users to upgrade to it. However, if the user has signed an arbitrary chain Merkle root that upgrades to the vulnerable module, then anybody can take over the user's Gnosis Safe on any network where it isn't deployed yet. Since this meta transaction is irrevocable, I don't think there's any remedy to this issue other than requiring the user to switch Gnosis Safes on new networks, or trying to frontrun attackers on new networks.

This issue is inherent to the fact that signing an arbitrary chain Merkle root allows anybody to execute the Merkle tree at any time, on any chain, forever, as long as the Merkle root nonce is valid. Generally, I think the arbitrary chain feature is powerful, but we should only use it when necessary.

2. Require the user to execute a separate legacy Merkle tree that migrates to the new Module version on every new network.

Here are two ways we could implement this:
a. Require our existing users to manually run a CLI command to migrate their Gnosis Safe on every new network until they're ready to switch to a new Gnosis Safe. This could be simple for us to implement, but the UX isn't ideal.
b. Re-arrange our plugin and website to handle proposals that propose two separate Merkle roots (the first for the migration, and the second for the actual deployment). This seems difficult to implement.

3. Allow migrations to happen in the same Merkle root as a standard deployment

I prefer this solution for a few reasons:
a. It provides the same UX as regular deployments
b. We can reuse this pattern for future migrations
c. This pattern doesn't require us to rearchitect how proposals work (like option 2b).

* `APPROVE` using the initial Merkle tree generation logic
* `EXECUTE` using the intial Merkle tree generation logic. This leaf would contain a multicall that enables the new Module and disables the old Module. These two actions could probably be split across two separate leaves, but that's an implementation detail.
* The leaves for the actual deployment using the new Merkle tree generation logic

After thinking about it for a bit, I couldn't find any reason why this approach isn't secure. If you spend a few minutes thinking through it, you should be able to convince yourself that this is true too.

The downside to this approach is that I think it'd add some complexity to the off-chain logic, specifically the `executeDeployment` function and the Merkle tree logic, but not an unreasonable amount. We'll also want to include this migration Merkle tree in the audit, since it'd include two types of Merkle leaves. I don't expect it to meaningfully increase the complexity of the audit though.
