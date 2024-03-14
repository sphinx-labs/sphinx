## Problem

Attempting to retry transactions in the simulation sometimes leads to a "nonce too low" error, which appears to be caused by a bug in Hardhat's simulation logic. I was able to reproduce this error somewhat consistently by following these steps:
1. Trigger a rate limit in the RPC endpoint
2. Immediately attempt to deploy the Gnosis Safe. If this also causes a rate limit error, attempting to execute another transaction causes the nonce error.

## Notes

* The success rate of reproducing this error is roughly 50%.
* I spent a couple hours trying to find the root cause of this bug in Hardhat's logic. It's probably possible to find the cause, but it's difficult, so I stopped trying. It's difficult because Hardhat's logic is a labyrinth, and because the error happens ~50% of the time, and because I couldn't figure out whether the first or second transaction contains the bug. (The first transaction causes the rate limit error, and the second transaction hits the nonce error). Particularly, it's not clear to me whether the signer's nonce should be 0 or 1, since I don't know whether Hardhat considers the transaction to be submitted. It seems like some of Hardhat's logic thinks the nonce should be 1, and some of it thinks the nonce should be 0. I don't know which logic should be considered the source of truth. I don't even know if there is a single source of truth.

## Steps to reproduce

1. Go to the branch: `sg/simulation-nonce-bug`

> Optional: If you want to see the diff of the changes that allowed me to reproduce the bug, run: `git diff head~1 head`

2. In the monorepo root: `yarn install && yarn build`

3. Go to the `.env` in the plugins package. Update the Optimism Sepolia RPC URL with a free tier Alchemy API key:
```
OPTIMISM_SEPOLIA_RPC_URL=https://opt-sepolia.g.alchemy.com/v2/LnkY6ebjCkyrITer8pQS3qk9EqfPMtVo
```

4. Consider making a note to change the RPC URL env variable back to its original value when you're done.

5. Search the monorepo for the string: "Put breakpoint here". Put a breakpoint there.

6. Create a debugging configuration in your `.vscode/launch.json`:
```json
    {
      "name": "Nonce bug",
      "type": "node",
      "request": "launch",
      "skipFiles": [
        "<node_internals>/**"
      ],
      "runtimeExecutable": "npx",
      "args": [
        "sphinx", "propose", "script/Sample.s.sol", "--networks", "optimism_sepolia"
      ],
      "cwd": "${workspaceFolder}/packages/plugins"
    },
```

7. Run the "Nonce bug" debugger configuration. If the breakpoint is hit, congrats, you've reproduced the bug. This'll happen roughly 50% of the time. If your Debug Console displays "txn hit rate limit" more than a few times, kill the process and try again. For some reason, the bug usually doesn't happen after the first attempt (i.e. it usually doesn't happen when two or more "txn hit rate limit" logs appear).

8. Search the monorepo for the string "Uncomment this line to fix the bug". Uncomment _all_ of those lines to add the bug fix.

9. `yarn workspaces run build:ts`

10. Run the same "Nonce bug" debugger configuration enough times to convince yourself that the bug was fixed.
