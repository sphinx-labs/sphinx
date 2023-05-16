import assert from 'assert'

import { ethers } from 'ethers'
import { EtherscanURLs } from '@nomiclabs/hardhat-etherscan/dist/src/types'
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
import {
  retrieveContractBytecode,
  getEtherscanEndpoints,
} from '@nomiclabs/hardhat-etherscan/dist/src/network/prober'
import { Bytecode } from '@nomiclabs/hardhat-etherscan/dist/src/solc/bytecode'
import { buildContractUrl } from '@nomiclabs/hardhat-etherscan/dist/src/util'
import { getLongVersion } from '@nomiclabs/hardhat-etherscan/dist/src/solc/version'
import { encodeArguments } from '@nomiclabs/hardhat-etherscan/dist/src/ABIEncoder'
import { chainConfig } from '@nomiclabs/hardhat-etherscan/dist/src/ChainConfig'
import {
  ChugSplashRegistryArtifact,
  DefaultAdapterArtifact,
  DEFAULT_ADAPTER_ADDRESS,
  buildInfo as chugsplashBuildInfo,
  DefaultUpdaterArtifact,
  DEFAULT_UPDATER_ADDRESS,
  OZTransparentAdapterArtifact,
  OZ_TRANSPARENT_ADAPTER_ADDRESS,
  OZUUPSUpdaterArtifact,
  OZ_UUPS_UPDATER_ADDRESS,
  OZUUPSOwnableAdapterArtifact,
  OZUUPSAccessControlAdapterArtifact,
  OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
  OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
  ChugSplashManagerArtifact,
  DefaultCreate3Artifact,
  DEFAULT_CREATE3_ADDRESS,
  DefaultGasPriceCalculatorArtifact,
  DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS,
  ManagedServiceArtifact,
  ChugSplashManagerProxyArtifact,
  ProxyArtifact,
} from '@chugsplash/contracts'
import { request } from 'undici'
import { CompilerInput } from 'hardhat/types'

import { customChains } from './constants'
import {
  getChugSplashConstructorArgs,
  getChugSplashRegistryAddress,
  getChugSplashManagerV1Address,
  getManagedServiceAddress,
  getReferenceChugSplashManagerProxyAddress,
  getReferenceDefaultProxyAddress,
} from './addresses'
import { CanonicalChugSplashConfig } from './config/types'
import {
  getChugSplashManagerAddress,
  getConfigArtifactsRemote,
  getConstructorArgs,
  getCreate3Address,
} from './utils'
import { getMinimumCompilerInput } from './languages/solidity/compiler'

export interface EtherscanResponseBody {
  status: string
  message: string
  result: any
}

export const RESPONSE_OK = '1'

export const verifyChugSplashConfig = async (
  canonicalConfig: CanonicalChugSplashConfig,
  provider: ethers.providers.Provider,
  networkName: string,
  apiKey: string
) => {
  const managerAddress = getChugSplashManagerAddress(
    canonicalConfig.options.organizationID
  )

  const etherscanApiEndpoints = await getEtherscanEndpoints(
    // Todo - figure out how to fit JsonRpcProvider into EthereumProvider type without casting as any
    provider as any,
    networkName,
    chainConfig,
    customChains
  )

  const artifacts = await getConfigArtifactsRemote(canonicalConfig)
  for (const [referenceName, contractConfig] of Object.entries(
    canonicalConfig.contracts
  )) {
    const { artifact, buildInfo } = artifacts[referenceName]
    const { abi, contractName, sourceName } = artifact
    const constructorArgValues = getConstructorArgs(
      canonicalConfig.contracts[referenceName].constructorArgs,
      abi
    )
    const implementationAddress = getCreate3Address(
      managerAddress,
      contractConfig.salt
    )

    const chugsplashInput = canonicalConfig.inputs.find((compilerInput) =>
      Object.keys(compilerInput.input.sources).includes(sourceName)
    )

    if (!chugsplashInput) {
      // Should not happen. We'll continue to the next contract.
      continue
    }
    const { input, solcVersion } = chugsplashInput

    const minimumCompilerInput = getMinimumCompilerInput(
      input,
      buildInfo.output.contracts,
      sourceName,
      contractName
    )

    // Verify the implementation
    await attemptVerification(
      provider,
      networkName,
      etherscanApiEndpoints.urls,
      implementationAddress,
      sourceName,
      contractName,
      abi,
      apiKey,
      minimumCompilerInput,
      solcVersion,
      constructorArgValues
    )

    // Link the proxy with its implementation
    await linkProxyWithImplementation(
      etherscanApiEndpoints.urls,
      apiKey,
      contractConfig.address,
      implementationAddress,
      contractName
    )
  }
}

export const verifyChugSplash = async (
  provider: ethers.providers.Provider,
  networkName: string,
  apiKey: string
) => {
  const etherscanApiEndpoints = await getEtherscanEndpoints(
    // Todo - figure out how to fit JsonRpcProvider into EthereumProvider type without casting as any
    provider as any,
    networkName,
    chainConfig,
    customChains
  )

  const contracts = [
    {
      artifact: ChugSplashRegistryArtifact,
      address: getChugSplashRegistryAddress(),
    },
    {
      artifact: ChugSplashManagerArtifact,
      address: getChugSplashManagerV1Address(),
    },
    { artifact: DefaultAdapterArtifact, address: DEFAULT_ADAPTER_ADDRESS },
    {
      artifact: OZUUPSOwnableAdapterArtifact,
      address: OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
    },
    {
      artifact: OZUUPSAccessControlAdapterArtifact,
      address: OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
    },
    {
      artifact: OZTransparentAdapterArtifact,
      address: OZ_TRANSPARENT_ADAPTER_ADDRESS,
    },
    { artifact: DefaultUpdaterArtifact, address: DEFAULT_UPDATER_ADDRESS },
    { artifact: OZUUPSUpdaterArtifact, address: OZ_UUPS_UPDATER_ADDRESS },
    { artifact: DefaultCreate3Artifact, address: DEFAULT_CREATE3_ADDRESS },
    {
      artifact: DefaultGasPriceCalculatorArtifact,
      address: DEFAULT_GAS_PRICE_CALCULATOR_ADDRESS,
    },
    { artifact: ManagedServiceArtifact, address: getManagedServiceAddress() },
    {
      artifact: ChugSplashManagerProxyArtifact,
      address: getReferenceChugSplashManagerProxyAddress(),
    },
    {
      artifact: ProxyArtifact,
      address: getReferenceDefaultProxyAddress(),
    },
  ]

  for (const { artifact, address } of contracts) {
    const { sourceName, contractName, abi } = artifact

    const minimumCompilerInput = getMinimumCompilerInput(
      chugsplashBuildInfo.input,
      chugsplashBuildInfo.output.contracts,
      sourceName,
      contractName
    )

    const chugSplashConstructorArgs = getChugSplashConstructorArgs()

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
      chugsplashBuildInfo.solcVersion,
      chugSplashConstructorArgs[sourceName]
    )
  }
}

export const attemptVerification = async (
  provider: ethers.providers.Provider,
  networkName: string,
  urls: EtherscanURLs,
  contractAddress: string,
  sourceName: string,
  contractName: string,
  abi: any,
  etherscanApiKey: string,
  compilerInput: CompilerInput,
  solcVersion: string,
  constructorArgValues: any[]
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

  const constructorArgsAbiEncoded = await encodeArguments(
    abi,
    sourceName,
    contractName,
    constructorArgValues
  )

  const verifyRequest = toVerifyRequest({
    apiKey: etherscanApiKey,
    contractAddress,
    sourceCode: JSON.stringify(compilerInput),
    sourceName,
    contractName,
    compilerVersion: solcFullVersion,
    constructorArguments: constructorArgsAbiEncoded,
  })
  let response
  try {
    response = await verifyContract(urls.apiURL, verifyRequest)
  } catch (err) {
    if (err.message === 'Contract source code already verified') {
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
     ${sourceName}:${contractName} at ${contractAddress}
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
      `Successfully verified ${contractName} on Etherscan:
      ${contractURL}`
    )
  } else {
    // Reaching this point shouldn't be possible unless the API is behaving in a new way.
    throw new Error(
      `The Etherscan API responded with an unexpected message.
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
  return responseBodyJson
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

export const isSupportedNetworkOnEtherscan = (chainId: number): boolean => {
  const chainIds = Object.values(chainConfig).map((config) => config.chainId)
  const customChainIds = customChains.map((chain) => chain.chainId)
  return chainIds.includes(chainId) || customChainIds.includes(chainId)
}
