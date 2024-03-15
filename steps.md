## Problem

0xBased reported:

> Hey Sam, ran into an issue, for some reason the "Running simulation..." doesn't end.
>
>I checked my alchemy logs and it seems to be stuck in a loop where it keeps doing the exact same one or two eth_getTransactionReceipt calls hundreds/thousands of times.

The bug happens because the Hardhat provider is stuck in an infinite loop while polling for a transaction receipt that doesn't exist. This always happens in the simulation after calling `hardhat_reset` for the first time (i.e. it always happens in the second iteration of the simulation). Here's a [Loom video](https://www.loom.com/share/4c38d85a685340229e87957a7726e105) where I reproduce the bug (including console logs for the relevant steps in the simulation).

## Notes

* I was able to reproduce the bug more than 50% of the time following the steps below.
* If you're unable to reproduce the bug, try changing the `callWithTimeout` call in `simulate.ts` to have a 30 second timeout.

## Steps to reproduce

1. Go to the branch: `sg/hardhat-reset-loop`

2. In the monorepo root, run `yarn install && yarn build`

3. Make sure you have a paid tier RPC endpoint in your plugins `.env` for Ethereum Sepolia.

4. From the root of the monorepo, open:
```
node_modules/@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider.js
```

Put the following code on lines 624-625 in this file. (Lines 624-625 are the first lines in the `_pollTransactionHashes` function).
```
const fs = require('fs');
fs.appendFileSync('poll.txt', 'polled\n')
```

The bug will cause the `_pollTransactionHashes` function to be triggered indefinitely.

5. Navigate to the plugins package. Then, run:
```
npx sphinx propose script/Sample.s.sol --networks sepolia
```

6. When the simulation starts, a file called `poll.txt` will appear in the plugins package. After roughly a minute or two, you should see `polled` start to appear repeatedly in `poll.txt`. It should keep appearing until you kill the process. Each time `polled` is written, an RPC request is made to the actual provider. You can see the RPC activity in your Alchemy's dashboard, although that's not necessary.
