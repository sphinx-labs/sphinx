import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import {
  CompilerOutputMetadata,
  ExplorerName,
  SystemContractType,
  additionalSystemContractsToVerify,
  getSphinxConstants,
  gnosisSafeBuildInfo,
  optimismPeripheryBuildInfo,
  remove0x,
  sphinxBuildInfo,
  permissionlessRelayBuildInfo,
} from '@sphinx-labs/contracts'
import { Logger } from '@eth-optimism/common-ts'
import { ChainConfig } from '@nomicfoundation/hardhat-verify/types'
import { Etherscan } from '@nomicfoundation/hardhat-verify/etherscan'

import { DeploymentConfig } from './config/types'
import { SphinxJsonRpcProvider } from './provider'
import { getMinimumCompilerInput } from './languages/solidity/compiler'
import {
  fetchNetworkConfigFromDeploymentConfig,
  formatSolcLongVersion,
  isLiveNetwork,
  sleep,
} from './utils'
import { BuildInfo, SolcInput } from './languages'
import {
  fetchEtherscanConfigForNetwork,
  fetchNameForNetwork,
  isVerificationSupportedForNetwork,
} from './networks'

// Load environment variables from .env
dotenv.config()

/**
 * Verify a deployment on Etherscan. Meant to be used by the DevOps Platform.
 */
export const verifySphinxConfig = async (
  deploymentConfig: DeploymentConfig,
  provider: ethers.Provider,
  apiKey: string,
  explorer?: ExplorerName
): Promise<void> => {
  const networkConfig = fetchNetworkConfigFromDeploymentConfig(
    (await provider.getNetwork()).chainId,
    deploymentConfig
  )

  for (const actionInput of networkConfig.actionInputs) {
    for (const {
      address,
      fullyQualifiedName,
      initCodeWithArgs,
    } of actionInput.contracts) {
      const { artifact, buildInfoId } =
        deploymentConfig.configArtifacts[fullyQualifiedName]
      const buildInfo = deploymentConfig.buildInfos[buildInfoId]

      const minimumCompilerInput = getMinimumCompilerInput(
        buildInfo.input,
        artifact.metadata
      )

      // Get the ABI encoded constructor arguments. We use the length of the `artifact.bytecode` to
      // determine where the contract's creation code ends and the constructor arguments begin. This
      // method works even if the `artifact.bytecode` contains externally linked library
      // placeholders or immutable variable placeholders, which are always the same length as the
      // real values.
      const encodedConstructorArgs = ethers.dataSlice(
        initCodeWithArgs,
        ethers.dataLength(artifact.bytecode)
      )

      const result = await attemptVerification(
        address,
        encodedConstructorArgs,
        fullyQualifiedName,
        buildInfo.solcLongVersion,
        minimumCompilerInput,
        provider,
        networkConfig.chainId,
        apiKey,
        explorer
      )

      if (!result.success) {
        throw new Error(`Contract verification failed.\n${result.message}`)
      }
    }
  }
}

/**
 * Verify a deployment on Etherscan with five retries per contract. Meant to be called by the Sphinx Foundry plugin.
 */
export const verifyDeploymentWithRetries = async (
  deploymentConfig: DeploymentConfig,
  provider: ethers.Provider,
  apiKey: string
): Promise<void> => {
  const maxAttempts = 10
  const networkConfig = fetchNetworkConfigFromDeploymentConfig(
    (await provider.getNetwork()).chainId,
    deploymentConfig
  )

  for (const actionInput of networkConfig.actionInputs) {
    for (const {
      address,
      fullyQualifiedName,
      initCodeWithArgs,
    } of actionInput.contracts) {
      let success = false

      const contractName = fullyQualifiedName.split(':')[1]
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { artifact, buildInfoId } =
          deploymentConfig.configArtifacts[fullyQualifiedName]
        const buildInfo = deploymentConfig.buildInfos[buildInfoId]

        const minimumCompilerInput = getMinimumCompilerInput(
          buildInfo.input,
          artifact.metadata
        )

        // Get the ABI encoded constructor arguments. We use the length of the `artifact.bytecode` to
        // determine where the contract's creation code ends and the constructor arguments begin. This
        // method works even if the `artifact.bytecode` contains externally linked library
        // placeholders or immutable variable placeholders, which are always the same length as the
        // real values.
        const encodedConstructorArgs = ethers.dataSlice(
          initCodeWithArgs,
          ethers.dataLength(artifact.bytecode)
        )

        const result = await attemptVerification(
          address,
          encodedConstructorArgs,
          fullyQualifiedName,
          buildInfo.solcLongVersion,
          minimumCompilerInput,
          provider,
          networkConfig.chainId,
          apiKey
        )

        if (result.success) {
          success = true
          break
        } else {
          console.log(
            `Verification failed for ${contractName} at ${address} (attempt ${attempt}/${maxAttempts}).\n` +
              `Retrying in 5 seconds.\n` +
              `Error message:\n` +
              result.message +
              `\n`
          )
          await sleep(5000)
        }
      }

      if (!success) {
        console.log(
          `Failed to verify contract ${contractName} at ${address} after ${maxAttempts} attempts.`
        )
      }
    }
  }
}

export const handleAlreadyVerifiedResponse = (
  err: any,
  address: string,
  contractURL: string
) => {
  if ((err.message as string)?.toLowerCase().includes('already verified')) {
    console.log(
      `The contract ${address} has already been verified on Etherscan:\n${contractURL}`
    )
    return { success: true }
  } else {
    return { success: false, message: err.message }
  }
}

export const attemptVerification = async (
  address: string,
  encodedConstructorArgs: string,
  fullyQualifiedName: string,
  solcLongVersion: string,
  minimumCompilerInput: SolcInput,
  provider: ethers.Provider,
  chainId: string,
  etherscanApiKey: string,
  explorer?: ExplorerName
): Promise<{ success: boolean; message?: string }> => {
  const urls = fetchEtherscanConfigForNetwork(BigInt(chainId), explorer)

  if (!urls) {
    throw new Error(
      `Could not find Etherscan or Blockscout configuration for network with chainId ${chainId}. This is a bug, please report it to the developers.`
    )
  }

  const contractName = fullyQualifiedName.split(':')[1]

  const deployedBytecode = remove0x(await provider.getCode(address))
  if (deployedBytecode.length === 0) {
    console.log(
      `Skipped verifying ${contractName} at ${address} because it is not deployed.`
    )
    // The bytecode probably doesn't exist because the deployment failed midway. We consider this a
    // success so that we don't attempt to re-verify this contract later.
    return { success: true }
  }

  const etherscan = new Etherscan(etherscanApiKey, urls.apiURL, urls.browserURL)

  const contractURL = etherscan.getContractUrl(address)

  let guid: string
  /**
   * We wrap this in a try/catch because this call may throw an error if the contract was recently
   * deployed and hasn't propogated to Etherscan's backend yet.
   *
   * An error may also occur if the contract is already verified which can happen in two scenarios:
   * - We're retrying verification and this contract was succesfully verified in a previous attempt.
   * - The contract was verified by some mechanism implemented by the Blockexplorer such as automatic
   * linking via source code matching.
   *
   * You might wonder why we do not check if a contract is already verified before attempting to verify
   * it here. The reason is that we've found that the `etherscan.isVerified()` function will sometimes
   * return true for contracts have been verified through source code matching. However, the source code
   * won't always appear in the Etherscan UI. We've found that in this situation if we simply attempt to
   * verify the contract, the source code will appear in the Etherscan UI.
   * See this repo to replicate that issue: https://github.com/sphinx-labs/etherscan_verification_bug
   *
   * It's useful to note that when attempting to verify a contract on Etherscan, an error may be thrown
   * if the contract is already verified. So to handle that, we call `etherscan.isVerified()`in the catch
   * block below and then return { success: true } if the contract is already verified according to that
   * function.
   */
  try {
    const response = await etherscan.verify(
      address,
      JSON.stringify(minimumCompilerInput),
      fullyQualifiedName,
      `v${solcLongVersion}`,
      remove0x(encodedConstructorArgs)
    )
    guid = response.message
  } catch (err) {
    return handleAlreadyVerifiedResponse(err, address, contractURL)
  }

  const networkName = fetchNameForNetwork(BigInt(chainId))
  console.log(
    `Successfully submitted source code for contract ${contractName}\n` +
      `at ${address} on ${networkName} for verification on Etherscan.\n` +
      `Waiting for verification result...`
  )

  // Compilation is bound to take some time so there's no sense in requesting status immediately.
  await sleep(700)

  // We wrap this in a try/catch because this call can fail if the contract inputs are invalid (e.g.
  // the solc version is improperly formatted).
  let verificationStatus: any
  try {
    verificationStatus = await etherscan.getVerificationStatus(guid)
  } catch (err) {
    return handleAlreadyVerifiedResponse(err, address, contractURL)
  }

  if (!(verificationStatus.isFailure() || verificationStatus.isSuccess())) {
    // Reaching this point shouldn't be possible unless the API is behaving in a new way.
    throw new Error(
      `The API responded with an unexpected message. Please report this issue to the.\n` +
        `Sphinx team. Contract verification may have succeeded and should be checked manually.\n` +
        `Message: ${verificationStatus.message}`
    )
  }

  if (verificationStatus.isSuccess()) {
    console.log(
      `Successfully verified contract ${contractName} on Etherscan:\n${contractURL}`
    )
    return { success: true }
  } else {
    return { success: false, message: verificationStatus.message }
  }
}

export const verifySphinxSystem = async (
  provider: SphinxJsonRpcProvider,
  logger: Logger
): Promise<void> => {
  const etherscanApiKey = process.env.ETHERSCAN_API_KEY
  if (!etherscanApiKey) {
    logger.error(
      `[Sphinx]: skipped verifying sphinx contracts. reason: no api key found`
    )
    return
  }

  const { name: networkName, chainId } = await provider.getNetwork()
  if (
    !isVerificationSupportedForNetwork(chainId) ||
    !(await isLiveNetwork(provider))
  ) {
    logger.info(
      `[Sphinx]: skipped verifying sphinx contracts. reason: etherscan not supported for: ${networkName}`
    )
    return
  }

  logger.info(
    '[Sphinx]: attempting to verify the sphinx contracts on etherscan...'
  )
  const contracts = getSphinxConstants().concat(
    additionalSystemContractsToVerify
  )

  // Iterate over the system contracts, attempting to verify each one. We wrap the for-loop in a
  // try/catch because this allows us to exit immediately if any contract fails to verify.
  try {
    for (const {
      artifact,
      expectedAddress,
      constructorArgs,
      type,
    } of contracts) {
      const { sourceName, contractName, abi } = artifact

      let buildInfo: BuildInfo
      if (type === SystemContractType.SPHINX) {
        buildInfo = sphinxBuildInfo
        buildInfo.solcLongVersion = formatSolcLongVersion(
          buildInfo.solcLongVersion
        )
      } else if (type === SystemContractType.PERMISSIONLESS_RELAY) {
        buildInfo = permissionlessRelayBuildInfo
        permissionlessRelayBuildInfo.solcLongVersion = formatSolcLongVersion(
          buildInfo.solcLongVersion
        )
      } else if (type === SystemContractType.OPTIMISM) {
        buildInfo = optimismPeripheryBuildInfo
      } else if (type === SystemContractType.GNOSIS_SAFE) {
        buildInfo = gnosisSafeBuildInfo
      } else {
        throw new Error(`Unknown system contract type. Should never happen.`)
      }

      const contractOutput =
        buildInfo.output.contracts[sourceName][contractName]
      const metadata: CompilerOutputMetadata =
        typeof contractOutput.metadata === 'string'
          ? JSON.parse(contractOutput.metadata)
          : contractOutput.metadata

      const minimumCompilerInput = getMinimumCompilerInput(
        buildInfo.input,
        metadata
      )

      const iface = new ethers.Interface(abi)

      const encodedConstructorArgs = iface.encodeDeploy(constructorArgs)

      const res = await attemptVerification(
        expectedAddress,
        encodedConstructorArgs,
        `${sourceName}:${contractName}`,
        buildInfo.solcLongVersion,
        minimumCompilerInput,
        provider,
        String(chainId),
        etherscanApiKey
      )

      if (!res.success) {
        console.error(res.message)
      }
    }

    logger.info(
      '[Sphinx]: finished attempting to verify the sphinx contracts on etherscan'
    )
  } catch (e) {
    console.error(e)
    logger.error(
      `[Sphinx]: error: failed to verify sphinx contracts for ${networkName} on etherscan`,
      e
    )
  }
}

// An array of built-in Etherscan chain configs. This is copied from Hardhat. We don't import their
// array because it's an internal data structure that isn't part of their documentation. We copy it
// to avoid a scenario where the structure of this array is changed or its file location is moved in
// a future version of @nomicfoundation/hardhat-verify that has the same minor and/or patch version.
// Note that Hardhat will not add new elements to this array anymore. ref:
// https://github.com/NomicFoundation/hardhat/blob/2a99de5908cd56766c3a77e2088d6b9f82bd85ef/packages/hardhat-verify/src/internal/chain-config.ts
// We don't actually need this since we define all network info in our contracts package SPHINX_NETWORKS array
// But it's convenient to keep this to pull info from when necessary.
export const builtinChains: Array<ChainConfig> = [
  {
    network: 'mainnet',
    chainId: 1,
    urls: {
      apiURL: 'https://api.etherscan.io/api',
      browserURL: 'https://etherscan.io',
    },
  },
  {
    network: 'goerli',
    chainId: 5,
    urls: {
      apiURL: 'https://api-goerli.etherscan.io/api',
      browserURL: 'https://goerli.etherscan.io',
    },
  },
  {
    network: 'optimisticEthereum',
    chainId: 10,
    urls: {
      apiURL: 'https://api-optimistic.etherscan.io/api',
      browserURL: 'https://optimistic.etherscan.io/',
    },
  },
  {
    network: 'bsc',
    chainId: 56,
    urls: {
      apiURL: 'https://api.bscscan.com/api',
      browserURL: 'https://bscscan.com',
    },
  },
  {
    network: 'sokol',
    chainId: 77,
    urls: {
      apiURL: 'https://blockscout.com/poa/sokol/api',
      browserURL: 'https://blockscout.com/poa/sokol',
    },
  },
  {
    network: 'bscTestnet',
    chainId: 97,
    urls: {
      apiURL: 'https://api-testnet.bscscan.com/api',
      browserURL: 'https://testnet.bscscan.com',
    },
  },
  {
    network: 'xdai',
    chainId: 100,
    urls: {
      apiURL: 'https://api.gnosisscan.io/api',
      browserURL: 'https://gnosisscan.io',
    },
  },
  {
    network: 'gnosis',
    chainId: 100,
    urls: {
      apiURL: 'https://api.gnosisscan.io/api',
      browserURL: 'https://gnosisscan.io',
    },
  },
  {
    network: 'heco',
    chainId: 128,
    urls: {
      apiURL: 'https://api.hecoinfo.com/api',
      browserURL: 'https://hecoinfo.com',
    },
  },
  {
    network: 'polygon',
    chainId: 137,
    urls: {
      apiURL: 'https://api.polygonscan.com/api',
      browserURL: 'https://polygonscan.com',
    },
  },
  {
    network: 'opera',
    chainId: 250,
    urls: {
      apiURL: 'https://api.ftmscan.com/api',
      browserURL: 'https://ftmscan.com',
    },
  },
  {
    network: 'hecoTestnet',
    chainId: 256,
    urls: {
      apiURL: 'https://api-testnet.hecoinfo.com/api',
      browserURL: 'https://testnet.hecoinfo.com',
    },
  },
  {
    network: 'optimisticGoerli',
    chainId: 420,
    urls: {
      apiURL: 'https://api-goerli-optimism.etherscan.io/api',
      browserURL: 'https://goerli-optimism.etherscan.io/',
    },
  },
  {
    network: 'polygonZkEVM',
    chainId: 1101,
    urls: {
      apiURL: 'https://api-zkevm.polygonscan.com/api',
      browserURL: 'https://zkevm.polygonscan.com',
    },
  },
  {
    network: 'moonbeam',
    chainId: 1284,
    urls: {
      apiURL: 'https://api-moonbeam.moonscan.io/api',
      browserURL: 'https://moonbeam.moonscan.io',
    },
  },
  {
    network: 'moonriver',
    chainId: 1285,
    urls: {
      apiURL: 'https://api-moonriver.moonscan.io/api',
      browserURL: 'https://moonriver.moonscan.io',
    },
  },
  {
    network: 'moonbaseAlpha',
    chainId: 1287,
    urls: {
      apiURL: 'https://api-moonbase.moonscan.io/api',
      browserURL: 'https://moonbase.moonscan.io/',
    },
  },
  {
    network: 'polygonZkEVMTestnet',
    chainId: 1442,
    urls: {
      apiURL: 'https://api-testnet-zkevm.polygonscan.com/api',
      browserURL: 'https://testnet-zkevm.polygonscan.com',
    },
  },
  {
    network: 'ftmTestnet',
    chainId: 4002,
    urls: {
      apiURL: 'https://api-testnet.ftmscan.com/api',
      browserURL: 'https://testnet.ftmscan.com',
    },
  },
  {
    network: 'base',
    chainId: 8453,
    urls: {
      apiURL: 'https://api.basescan.org/api',
      browserURL: 'https://basescan.org/',
    },
  },
  {
    network: 'chiado',
    chainId: 10200,
    urls: {
      apiURL: 'https://gnosis-chiado.blockscout.com/api',
      browserURL: 'https://gnosis-chiado.blockscout.com',
    },
  },
  {
    network: 'arbitrumOne',
    chainId: 42161,
    urls: {
      apiURL: 'https://api.arbiscan.io/api',
      browserURL: 'https://arbiscan.io/',
    },
  },
  {
    network: 'avalancheFujiTestnet',
    chainId: 43113,
    urls: {
      apiURL: 'https://api-testnet.snowtrace.io/api',
      browserURL: 'https://testnet.snowtrace.io/',
    },
  },
  {
    network: 'avalanche',
    chainId: 43114,
    urls: {
      apiURL: 'https://api.snowtrace.io/api',
      browserURL: 'https://snowtrace.io/',
    },
  },
  {
    network: 'polygonMumbai',
    chainId: 80001,
    urls: {
      apiURL: 'https://api-testnet.polygonscan.com/api',
      browserURL: 'https://mumbai.polygonscan.com/',
    },
  },
  {
    network: 'baseGoerli',
    chainId: 84531,
    urls: {
      apiURL: 'https://api-goerli.basescan.org/api',
      browserURL: 'https://goerli.basescan.org/',
    },
  },
  {
    network: 'arbitrumTestnet',
    chainId: 421611,
    urls: {
      apiURL: 'https://api-testnet.arbiscan.io/api',
      browserURL: 'https://testnet.arbiscan.io/',
    },
  },
  {
    network: 'arbitrumGoerli',
    chainId: 421613,
    urls: {
      apiURL: 'https://api-goerli.arbiscan.io/api',
      browserURL: 'https://goerli.arbiscan.io/',
    },
  },
  {
    network: 'sepolia',
    chainId: 11155111,
    urls: {
      apiURL: 'https://api-sepolia.etherscan.io/api',
      browserURL: 'https://sepolia.etherscan.io',
    },
  },
  {
    network: 'aurora',
    chainId: 1313161554,
    urls: {
      apiURL: 'https://explorer.mainnet.aurora.dev/api',
      browserURL: 'https://explorer.mainnet.aurora.dev',
    },
  },
  {
    network: 'auroraTestnet',
    chainId: 1313161555,
    urls: {
      apiURL: 'https://explorer.testnet.aurora.dev/api',
      browserURL: 'https://explorer.testnet.aurora.dev',
    },
  },
  {
    network: 'harmony',
    chainId: 1666600000,
    urls: {
      apiURL: 'https://ctrver.t.hmny.io/verify',
      browserURL: 'https://explorer.harmony.one',
    },
  },
  {
    network: 'harmonyTest',
    chainId: 1666700000,
    urls: {
      apiURL: 'https://ctrver.t.hmny.io/verify?network=testnet',
      browserURL: 'https://explorer.pops.one',
    },
  },
]
