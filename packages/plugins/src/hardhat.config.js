// This file is written in JavaScript instead of TypeScript because Hardhat throws an error
// if the file is written in TypeScript and the current repo (i.e. Sphinx's repo) uses ESM.

require('@nomicfoundation/hardhat-ethers')
const dotenv = require('dotenv')

const { simulateDeploymentSubtask } = require('./hardhat/simulate')

// Load environment variables from .env
dotenv.config()

const forkUrl = process.env.SPHINX_INTERNAL__FORK_URL
if (!forkUrl) {
  throw new Error(`Could not find fork RPC URL.`)
}
const chainId = process.env.SPHINX_INTERNAL__CHAIN_ID
if (!chainId) {
  throw new Error(`Could not find chain ID.`)
}
const blockGasLimit = process.env.SPHINX_INTERNAL__BLOCK_GAS_LIMIT
if (!blockGasLimit) {
  throw new Error(`Could not find block gas limit.`)
}
const blockNumber = process.env.SPHINX_INTERNAL__BLOCK_NUMBER

subtask('sphinxSimulateDeployment', simulateDeploymentSubtask)

module.exports = {
  networks: {
    hardhat: {
      chainId: Number(chainId),
      forking: {
        url: forkUrl,
        blockNumber:
          typeof blockNumber === 'string' ? Number(blockNumber) : undefined,
      },
      blockGasLimit: Number(blockGasLimit),
      // We don't use Hardhat's genesis accounts, so we set this to an empty array. This eliminates
      // 20 RPC calls that Hardhat sends at the beginning of every simulation to get the nonce of
      // each genesis account. (There's one RPC call per genesis account). Hardhat needs to get
      // these nonces on forked networks because the private keys are publicly known.
      //
      // If a user's script uses one of these genesis accounts, Hardhat will fetch its nonce on an
      // as-needed basis, which is the behavior that we want.
      accounts: [],
    },
  },
}
