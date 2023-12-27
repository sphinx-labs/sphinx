import assert from 'assert'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
// import {
//   CustomChain,
//   EtherscanNetworkEntry,
//   EtherscanURLs,
// } from '@nomiclabs/hardhat-etherscan/dist/src/types'
// import {
//   getVerificationStatus,
//   verifyContract,
//   delay,
//   EtherscanResponse,
// } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanService'
// import {
//   toVerifyRequest,
//   toCheckStatusRequest,
// } from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanVerifyContractRequest'
import { retrieveContractBytecode } from '@nomiclabs/hardhat-etherscan/dist/src/network/prober'
// import { throwUnsupportedNetwork } from '@nomiclabs/hardhat-etherscan/dist/src/errors'
// import { Bytecode } from '@nomiclabs/hardhat-etherscan/dist/src/solc/bytecode'
// import { buildContractUrl } from '@nomiclabs/hardhat-etherscan/dist/src/util'
// import { getLongVersion } from '@nomiclabs/hardhat-etherscan/dist/src/solc/version'
// import { chainConfig } from '@nomiclabs/hardhat-etherscan/dist/src/ChainConfig'
import { request } from 'undici'
import { CompilerInput } from 'hardhat/types'
import {
  CompilerOutputMetadata,
  SystemContractType,
  additionalSystemContractsToVerify,
  getSphinxConstants,
  gnosisSafeBuildInfo,
  optimismPeripheryBuildInfo,
  remove0x,
  sphinxBuildInfo,
} from '@sphinx-labs/contracts'
import { Logger } from '@eth-optimism/common-ts'
// TODO(later): check that these dependencies aren't brittle (i.e. check that a minor/patch update
// won't potentially break these dependencies).
import { ChainConfig } from '@nomicfoundation/hardhat-verify/types'
import { builtinChains } from '@nomicfoundation/hardhat-verify/internal/chain-config'
import { Etherscan } from '@nomicfoundation/hardhat-verify/etherscan'

import { customChains } from './constants'
import { CompilerConfig, ConfigArtifacts } from './config/types'
import { SphinxJsonRpcProvider } from './provider'
import { getMinimumCompilerInput } from './languages/solidity/compiler'
import { isLiveNetwork, sleep } from './utils'
import { BuildInfo } from './languages'

// Load environment variables from .env
dotenv.config()

// TODO(docs): we don't use hardhat's version because they use a different type of provider (an EthereumProvider).
// TODO(docs): ref @nomicfoundation/hardhat-etherscan:src/internal/etherscan.ts:getChainConfig
export const getChainConfig = (chainId: number): ChainConfig => {
  const chainConfig = [
    // custom chains has higher precedence than builtin chains
    ...[...customChains].reverse(), // the last entry has higher precedence
    ...builtinChains,
  ].find((config) => config.chainId === chainId)

  if (chainConfig === undefined) {
    throw new Error(`Could not find chain config for: ${chainId}`)
  }

  return chainConfig
}

export const verifySphinxConfig = async (
  compilerConfig: CompilerConfig,
  configArtifacts: ConfigArtifacts,
  provider: ethers.Provider,
  networkName: string,
  apiKey: string
) => {
  const { urls } = getChainConfig(Number(compilerConfig.chainId))

  for (const actionInput of compilerConfig.actionInputs) {
    for (const address of Object.keys(actionInput.contracts)) {
      const { fullyQualifiedName, initCodeWithArgs } =
        actionInput.contracts[address]

      const { artifact } = configArtifacts[fullyQualifiedName]
      const { contractName, sourceName, metadata, bytecode } = artifact

      // Get the ABI encoded constructor arguments. We use the length of the `artifact.bytecode` to
      // determine where the contract's creation code ends and the constructor arguments begin. This
      // method works even if the `artifact.bytecode` contains externally linked library placeholders
      // or immutable variable placeholders, which are always the same length as the real values.
      const encodedConstructorArgs = ethers.dataSlice(
        initCodeWithArgs,
        ethers.dataLength(bytecode)
      )

      const sphinxInput = compilerConfig.inputs.find((compilerInput) =>
        Object.keys(compilerInput.input.sources).includes(sourceName)
      )

      if (!sphinxInput) {
        throw new Error(
          `Could not find compiler input for ${sourceName}. Should never happen.`
        )
      }
      const { input, solcLongVersion } = sphinxInput

      const minimumCompilerInput = getMinimumCompilerInput(input, metadata)

      await attemptVerification(
        provider,
        networkName,
        urls,
        address,
        sourceName,
        contractName,
        apiKey,
        minimumCompilerInput,
        solcLongVersion,
        encodedConstructorArgs
      )
    }
  }
}

export const attemptVerification = async (
  provider: ethers.Provider,
  networkName: string,
  urls: ChainConfig['urls'],
  contractAddress: string,
  sourceName: string,
  contractName: string,
  etherscanApiKey: string,
  compilerInput: CompilerInput,
  solcLongVersion: string,
  encodedConstructorArgs: string
) => {
  const deployedBytecode = remove0x(await provider.getCode(contractAddress))
  if (deployedBytecode.length === 0) {
    throw new Error(`Contract is not deployed: ${contractAddress}`)
  }

  const instance = new Etherscan(etherscanApiKey, urls.apiURL, urls.browserURL)

  if (!(await instance.isVerified(contractAddress))) {
    const { message: guid } = await instance.verify(
      contractAddress,
      JSON.stringify(compilerInput),
      `${sourceName}:${contractName}`,
      solcLongVersion,
      remove0x(encodedConstructorArgs)
    )

    console.log(
      `Successfully submitted source code for contract
       ${contractName} at ${contractAddress} on ${networkName}
       for verification on the block explorer. Waiting for verification result...
      `
    )

    // TODO(later): copy the etherscan verification subtask logic instead of rolling your own

    await sleep(1000)
    let verificationStatus: TODO
    try {
      await instance.getVerificationStatus(guid)


    if (verificationStatus.isSuccess()) {
      const contractURL = instance.getContractUrl(contractAddress)
      console.log(
        `Successfully verified contract "${contractName}" at ${contractAddress} on ${networkName}:\n${contractURL}`
      )
    } else {
      // Reaching this point shouldn't be possible unless the API is behaving in a new way.
      throw new Error(
        `The ${networkName} Etherscan API responded with an unexpected message.
      Contract verification may have succeeded and should be checked manually.
      Message: ${verificationStatus.message}`
      )
    }
  }

  let verificationStatus: EtherscanResponse
  try {
    verificationStatus = await getVerificationStatus(urls.apiURL, pollRequest)
  } catch (err) {
    if (err.message.includes('Reason: Already Verified')) {
      console.log(
        `${contractName} has already been already verified:
        ${buildContractUrl(urls.browserURL, contractAddress)}`
      )
      return
    } else {
      throw err
    }
  }

  if (verificationStatus.isVerificationSuccess()) {
    const contractURL = buildContractUrl(urls.browserURL, contractAddress)
    console.log(
      `Successfully verified ${contractName} on ${networkName} Etherscan:
      ${contractURL}`
    )
  } else {
    // Reaching this point shouldn't be possible unless the API is behaving in a new way.
    throw new Error(
      `The ${networkName} Etherscan API responded with an unexpected message.
      Contract verification may have succeeded and should be checked manually.
      Message: ${verificationStatus.message}`
    )
  }
  }
}

export const isSupportedNetworkOnEtherscan = (
  chainId: number
): boolean => {
  const chainConfig = [
    ...customChains,
    ...builtinChains,
  ].find((config) => config.chainId === chainId)

  return chainConfig !== undefined
}

export const etherscanVerifySphinxSystem = async (
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
    !(isSupportedNetworkOnEtherscan(Number(chainId))) ||
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
  const { urls } = getChainConfig(Number(chainId))
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

      await attemptVerification(
        provider,
        networkName,
        urls,
        expectedAddress,
        sourceName,
        contractName,
        etherscanApiKey,
        minimumCompilerInput,
        buildInfo.solcLongVersion,
        encodedConstructorArgs
      )
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
