// TODO(later): rm eslint-disable
/* eslint-disable */
require('@nomicfoundation/hardhat-ethers')
const dotenv = require('dotenv')
const { simulateDeploymentTask } = require('./tasks')

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

// TODO(later): c/f ES2019

// TODO(later): rename and move
// TODO(later): task -> subtask
task('sphinxSimulateDeployment', '', simulateDeploymentTask)

module.exports = {
  networks: {
    hardhat: {
      chainId: Number(chainId),
      forking: {
        url: forkUrl,
      }
    }
  }
}
