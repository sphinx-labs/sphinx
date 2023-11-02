import assert from 'assert'

import { ethers } from 'ethers'
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider'
import {
  CustomChain,
  EtherscanNetworkEntry,
  EtherscanURLs,
} from '@nomiclabs/hardhat-etherscan/dist/src/types'
import {
  getVerificationStatus,
  verifyContract,
  delay,
  EtherscanResponse,
} from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanService'
import {
  toVerifyRequest,
  toCheckStatusRequest,
} from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanVerifyContractRequest'
import { retrieveContractBytecode } from '@nomiclabs/hardhat-etherscan/dist/src/network/prober'
import { throwUnsupportedNetwork } from '@nomiclabs/hardhat-etherscan/dist/src/errors'
import { Bytecode } from '@nomiclabs/hardhat-etherscan/dist/src/solc/bytecode'
import { buildContractUrl } from '@nomiclabs/hardhat-etherscan/dist/src/util'
import { getLongVersion } from '@nomiclabs/hardhat-etherscan/dist/src/solc/version'
import { encodeArguments } from '@nomiclabs/hardhat-etherscan/dist/src/ABIEncoder'
import { chainConfig } from '@nomiclabs/hardhat-etherscan/dist/src/ChainConfig'
import { buildInfo as sphinxBuildInfo } from '@sphinx-labs/contracts'
import { request } from 'undici'
import { CompilerInput } from 'hardhat/types'

import { customChains } from './constants'
import { CompilerConfig, ConfigArtifacts } from './config/types'
import { SphinxJsonRpcProvider } from './provider'
import { getMinimumCompilerInput } from './languages/solidity/compiler'
import { getSphinxConstants } from './contract-info'
import { CompilerOutputMetadata } from './languages'
import { remove0x } from './utils'

export interface EtherscanResponseBody {
  status: string
  message: string
  result: any
}

export const RESPONSE_OK = '1'

export const getEtherscanEndpointForNetwork = (
  chainId: number
): EtherscanNetworkEntry | CustomChain => {
  const chainIdsToNames = new Map(
    Object.entries(chainConfig).map(([chainName, config]) => [
      config.chainId,
      chainName,
    ])
  )

  const networkInCustomChains = [...customChains]
    .reverse() // the last entry wins
    .find((customChain) => customChain.chainId === chainId)

  // if there is a custom chain with the given chain id, that one is preferred
  // over the built-in ones
  if (networkInCustomChains !== undefined) {
    return networkInCustomChains
  }

  const network = networkInCustomChains ?? chainIdsToNames.get(chainId)

  if (network === undefined) {
    // The network name isn't actually used by this function
    throwUnsupportedNetwork('', chainId)
  }

  const chainConfigEntry = chainConfig[network]

  return { network, urls: chainConfigEntry.urls }
}

export const verifySphinxConfig = async (
  compilerConfig: CompilerConfig,
  configArtifacts: ConfigArtifacts,
  provider: ethers.Provider,
  networkName: string,
  apiKey: string
) => {
  const etherscanApiEndpoints = await getEtherscanEndpointForNetwork(
    Number((await provider.getNetwork()).chainId)
  )

  for (const actionInput of compilerConfig.actionInputs) {
    for (const address of Object.keys(actionInput.contracts)) {
      const { fullyQualifiedName, initCodeWithArgs } =
        actionInput.contracts[address]

      const { artifact } = configArtifacts[fullyQualifiedName]
      const { abi, contractName, sourceName, metadata, bytecode } = artifact

      // Get the ABI encoded constructor arguments. We use the length of the `artifact.bytecode` to
      // determine where the contract's creation code ends and the constructor arguments begin. This
      // method works even if the `artifact.bytecode` contains externally linked library placeholders
      // or immutable variable placeholders, which are always the same length as the real values.
      const encodedConstructorArgs = remove0x(
        ethers.dataSlice(initCodeWithArgs, ethers.dataLength(bytecode))
      )

      const sphinxInput = compilerConfig.inputs.find((compilerInput) =>
        Object.keys(compilerInput.input.sources).includes(sourceName)
      )

      if (!sphinxInput) {
        throw new Error(
          `Could not find compiler input for ${sourceName}. Should never happen.`
        )
      }
      const { input, solcVersion } = sphinxInput

      const minimumCompilerInput = getMinimumCompilerInput(input, metadata)

      await attemptVerification(
        provider,
        networkName,
        etherscanApiEndpoints.urls,
        address,
        sourceName,
        contractName,
        abi,
        apiKey,
        minimumCompilerInput,
        solcVersion,
        encodedConstructorArgs
      )

      // TODO(upgrades):
      // if (contractConfig.kind !== 'immutable') {
      //   // Link the proxy with its implementation
      //   await linkProxyWithImplementation(
      //     etherscanApiEndpoints.urls,
      //     apiKey,
      //     contractConfig.address,
      //     implementationAddress,
      //     contractName
      //   )
      // }
    }
  }
}

export const verifySphinx = async (
  provider: ethers.Provider,
  networkName: string,
  apiKey: string
) => {
  const etherscanApiEndpoints = await getEtherscanEndpointForNetwork(
    Number((await provider.getNetwork()).chainId)
  )

  for (const {
    artifact,
    expectedAddress,
    constructorArgs,
  } of await getSphinxConstants(provider)) {
    const { sourceName, contractName, abi } = artifact

    const contractOutput =
      sphinxBuildInfo.output.contracts[sourceName][contractName]
    const metadata: CompilerOutputMetadata =
      typeof contractOutput.metadata === 'string'
        ? JSON.parse(contractOutput.metadata)
        : contractOutput.metadata

    const minimumCompilerInput = getMinimumCompilerInput(
      sphinxBuildInfo.input,
      metadata
    )

    const encodedConstructorArgs = await encodeArguments(
      abi,
      sourceName,
      contractName,
      constructorArgs
    )

    await attemptVerification(
      provider,
      networkName,
      etherscanApiEndpoints.urls,
      expectedAddress,
      sourceName,
      contractName,
      abi,
      apiKey,
      minimumCompilerInput,
      sphinxBuildInfo.solcVersion,
      encodedConstructorArgs
    )
  }
}

export const attemptVerification = async (
  provider: ethers.Provider,
  networkName: string,
  urls: EtherscanURLs,
  contractAddress: string,
  sourceName: string,
  contractName: string,
  abi: any,
  etherscanApiKey: string,
  compilerInput: CompilerInput,
  solcVersion: string,
  encodedConstructorArgs: string
) => {
  const deployedBytecodeHex = await retrieveContractBytecode(
    contractAddress,
    provider as any,
    networkName
  )
  const deployedBytecode = new Bytecode(deployedBytecodeHex)
  const inferredSolcVersion = deployedBytecode.getInferredSolcVersion()

  assert(
    solcVersion === inferredSolcVersion,
    'Compiler version in artifact does not match deployed contract compiler version'
  )

  const solcFullVersion = await getLongVersion(solcVersion)

  const verifyRequest = toVerifyRequest({
    apiKey: etherscanApiKey,
    contractAddress,
    sourceCode: JSON.stringify(compilerInput),
    sourceName,
    contractName,
    compilerVersion: solcFullVersion,
    constructorArguments: encodedConstructorArgs,
  })

  let response
  try {
    response = await verifyContract(urls.apiURL, verifyRequest)
  } catch (err) {
    if (
      err.message === 'Contract source code already verified' ||
      err.message.includes('Smart-contract already verified')
    ) {
      console.log(
        `${contractName} has already been already verified:
        ${buildContractUrl(urls.browserURL, contractAddress)}`
      )
      return
    } else {
      throw err
    }
  }

  console.log(
    `Successfully submitted source code for contract
     ${sourceName}:${contractName} at ${contractAddress} on ${networkName}
     for verification on the block explorer. Waiting for verification result...
    `
  )

  const pollRequest = toCheckStatusRequest({
    apiKey: etherscanApiKey,
    guid: response.message,
  })

  // Compilation is bound to take some time so there's no sense in requesting status immediately.
  await delay(700)
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

export const linkProxyWithImplementation = async (
  urls: EtherscanURLs,
  etherscanApiKey: string,
  proxyAddress: string,
  implAddress: string,
  implContractName: string
) => {
  const params = {
    module: 'contract',
    action: 'verifyproxycontract',
    address: proxyAddress,
    expectedimplementation: implAddress,
  }
  let responseBody = await callEtherscanApi(urls, etherscanApiKey, params)

  if (responseBody.status === RESPONSE_OK) {
    // Initial call was OK, but need to send a status request using the returned guid to get the
    // actual verification status
    const guid = responseBody.result
    responseBody = await checkProxyVerificationStatus(
      urls,
      etherscanApiKey,
      guid
    )

    while (responseBody.result === 'Pending in queue') {
      await delay(3000)
      responseBody = await checkProxyVerificationStatus(
        urls,
        etherscanApiKey,
        guid
      )
    }
  }

  if (responseBody.status === RESPONSE_OK) {
    console.log(
      `Successfully linked ${implContractName} proxy to implementation.`
    )
  } else {
    throw new Error(
      `Failed to link ${implContractName} proxy with its implementation.
Reason: ${responseBody.result}`
    )
  }
}

export const callEtherscanApi = async (
  etherscanApiEndpoints: EtherscanURLs,
  etherscanApiKey: string,
  params: any
): Promise<EtherscanResponseBody> => {
  const parameters = new URLSearchParams({
    ...params,
    apikey: etherscanApiKey,
  })

  const response = await request(etherscanApiEndpoints.apiURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: parameters.toString(),
  })

  if (!(response.statusCode >= 200 && response.statusCode <= 299)) {
    const responseBodyText = await response.body.text()
    throw new Error(
      `Etherscan API call failed with status ${response.statusCode}.
Response: ${responseBodyText}`
    )
  }

  const responseBodyJson = await response.body.json()
  return responseBodyJson as EtherscanResponseBody
}

export const checkProxyVerificationStatus = async (
  etherscanApiEndpoints: EtherscanURLs,
  etherscanApiKey: string,
  guid: string
): Promise<EtherscanResponseBody> => {
  const checkProxyVerificationParams = {
    module: 'contract',
    action: 'checkproxyverification',
    apikey: etherscanApiKey,
    guid,
  }

  const responseBody = await callEtherscanApi(
    etherscanApiEndpoints,
    etherscanApiKey,
    checkProxyVerificationParams
  )
  return responseBody
}

export const isSupportedNetworkOnEtherscan = async (
  provider: SphinxJsonRpcProvider | HardhatEthersProvider
): Promise<boolean> => {
  const chainIdsToNames = new Map(
    Object.entries(chainConfig).map(([chainName, config]) => [
      config.chainId,
      chainName,
    ])
  )

  const chainID = parseInt(await provider.send('eth_chainId', []), 16)

  const networkInCustomChains = [...customChains]
    .reverse() // the last entry wins
    .find((customChain) => customChain.chainId === chainID)

  const network = networkInCustomChains ?? chainIdsToNames.get(chainID)

  if (network === undefined) {
    return false
  }

  return true
}
