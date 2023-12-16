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

// TODO(docs): this file is javascript b/c esm error

// TODO(docs): in entire PR

subtask('sphinxSimulateDeployment', simulateDeploymentSubtask)

module.exports = {
  networks: {
    hardhat: {
      chainId: Number(chainId),
      forking: {
        url: forkUrl,
      },
    },
  },
}
