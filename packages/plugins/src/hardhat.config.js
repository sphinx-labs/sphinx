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

subtask('sphinxSimulateDeployment', simulateDeploymentSubtask)

module.exports = {
  networks: {
    hardhat: {
      chainId: Number(chainId),
      forking: {
        url: forkUrl,
      },
      blockGasLimit: Number(blockGasLimit),
    },
  },
}
