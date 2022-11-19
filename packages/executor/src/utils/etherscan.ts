import assert from 'assert'

import { Contract } from 'ethers'
import {
  CanonicalChugSplashConfig,
  CompilerInput,
  getChugSplashManagerProxyAddress,
  getProxyAddress,
  parseChugSplashConfig,
} from '@chugsplash/core'
import {
  getConstructorArgs,
  TASK_CHUGSPLASH_FETCH,
  getArtifactsFromParsedCanonicalConfig,
} from '@chugsplash/plugins'
import { TASK_VERIFY_GET_ETHERSCAN_ENDPOINT } from '@nomiclabs/hardhat-etherscan/dist/src/constants'
import { EtherscanURLs } from '@nomiclabs/hardhat-etherscan/dist/src/types'
import {
  getVerificationStatus,
  EtherscanResponse,
  verifyContract,
  delay,
} from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanService'
import {
  toVerifyRequest,
  toCheckStatusRequest,
} from '@nomiclabs/hardhat-etherscan/dist/src/etherscan/EtherscanVerifyContractRequest'
import { resolveEtherscanApiKey } from '@nomiclabs/hardhat-etherscan/dist/src/resolveEtherscanApiKey'
import { retrieveContractBytecode } from '@nomiclabs/hardhat-etherscan/dist/src/network/prober'
import { Bytecode } from '@nomiclabs/hardhat-etherscan/dist/src/solc/bytecode'
import { buildContractUrl } from '@nomiclabs/hardhat-etherscan/dist/src/util'
import { getLongVersion } from '@nomiclabs/hardhat-etherscan/dist/src/solc/version'
import { encodeArguments } from '@nomiclabs/hardhat-etherscan/dist/src/ABIEncoder'
import {
  ChugSplashManagerABI,
  CHUGSPLASH_MANAGER_ADDRESS,
} from '@chugsplash/contracts'
import { EthereumProvider, HardhatRuntimeEnvironment } from 'hardhat/types'
import { request } from 'undici'

export interface EtherscanResponseBody {
  status: string
  message: string
  result: any
}

export const RESPONSE_OK = '1'

export const verifyChugSplashConfig = async (
  hre: HardhatRuntimeEnvironment,
  configUri: string
) => {
  const { etherscanApiKey, etherscanApiEndpoints } = await getEtherscanInfo(hre)

  const canonicalConfig = await hre.run(TASK_CHUGSPLASH_FETCH, {
    configUri,
  })
  const artifacts = await getArtifactsFromParsedCanonicalConfig(
    hre,
    parseChugSplashConfig(canonicalConfig) as CanonicalChugSplashConfig
  )
  const ChugSplashManager = new Contract(
    getChugSplashManagerProxyAddress(canonicalConfig.options.projectName),
    ChugSplashManagerABI,
    hre.ethers.provider
  )

  // Link the project's ChugSplashManagerProxy with the ChugSplashManager.
  const chugsplashManagerProxyAddress = getChugSplashManagerProxyAddress(
    canonicalConfig.options.projectName
  )
  try {
    await linkProxyWithImplementation(
      etherscanApiEndpoints,
      etherscanApiKey,
      chugsplashManagerProxyAddress,
      CHUGSPLASH_MANAGER_ADDRESS,
      'ChugSplashManager'
    )
  } catch (err) {
    console.error(err)
  }

  for (const referenceName of Object.keys(canonicalConfig.contracts)) {
    const artifact = artifacts[referenceName]
    const { abi, contractName, sourceName, compilerOutput } = artifact
    const { constructorArgValues } = getConstructorArgs(
      canonicalConfig,
      referenceName,
      abi,
      compilerOutput,
      sourceName,
      contractName
    )

    const implementationAddress = await ChugSplashManager.implementations(
      referenceName
    )
    const proxyAddress = getProxyAddress(
      canonicalConfig.options.projectName,
      referenceName
    )

    const compilerInput = canonicalConfig.inputs.find((compilerInputs) =>
      Object.keys(compilerInputs.input.sources).includes(sourceName)
    )

    // Verify the implementation
    try {
      await attemptVerification(
        hre.network.provider,
        hre.network.name,
        etherscanApiEndpoints,
        implementationAddress,
        sourceName,
        contractName,
        abi,
        etherscanApiKey,
        compilerInput.input,
        compilerInput.solcVersion,
        constructorArgValues
      )
    } catch (err) {
      console.error(err)
    }

    try {
      await linkProxyWithImplementation(
        etherscanApiEndpoints,
        etherscanApiKey,
        proxyAddress,
        implementationAddress,
        contractName
      )
    } catch (err) {
      console.error(err)
    }
  }
}

export const attemptVerification = async (
  provider: EthereumProvider,
  networkName: string,
  etherscanApiEndpoints: EtherscanURLs,
  contractAddress: string,
  sourceName: string,
  contractName: string,
  abi: any,
  etherscanApiKey: string,
  compilerInput: CompilerInput,
  solcVersion: string,
  constructorArgValues: any[]
): Promise<EtherscanResponse> => {
  const deployedBytecodeHex = await retrieveContractBytecode(
    contractAddress,
    provider,
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
    response = await verifyContract(etherscanApiEndpoints.apiURL, verifyRequest)
  } catch (err) {
    if (err.message === 'Contract source code already verified') {
      console.log(
        `${contractName} has already been already verified:
        ${buildContractUrl(etherscanApiEndpoints.browserURL, contractAddress)}`
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
  let verificationStatus
  try {
    verificationStatus = await getVerificationStatus(
      etherscanApiEndpoints.apiURL,
      pollRequest
    )
  } catch (err) {
    if (err.message.includes('Reason: Already Verified')) {
      console.log(
        `${contractName} has already been already verified:
        ${buildContractUrl(etherscanApiEndpoints.browserURL, contractAddress)}`
      )
      return
    } else {
      throw err
    }
  }

  if (verificationStatus.isVerificationSuccess()) {
    const contractURL = buildContractUrl(
      etherscanApiEndpoints.browserURL,
      contractAddress
    )
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

export const getEtherscanInfo = async (
  hre: any
): Promise<{
  etherscanApiKey: string
  etherscanApiEndpoints: EtherscanURLs
}> => {
  const { etherscan } = hre.config

  const { network: verificationNetwork, urls: etherscanApiEndpoints } =
    await hre.run(TASK_VERIFY_GET_ETHERSCAN_ENDPOINT)

  const etherscanApiKey = resolveEtherscanApiKey(
    etherscan.apiKey,
    verificationNetwork
  )

  return { etherscanApiKey, etherscanApiEndpoints }
}

export const linkProxyWithImplementation = async (
  etherscanApiEndpoints: EtherscanURLs,
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
  let responseBody = await callEtherscanApi(
    etherscanApiEndpoints,
    etherscanApiKey,
    params
  )

  if (responseBody.status === RESPONSE_OK) {
    // Initial call was OK, but need to send a status request using the returned guid to get the
    // actual verification status
    const guid = responseBody.result
    responseBody = await checkProxyVerificationStatus(
      etherscanApiEndpoints,
      etherscanApiKey,
      guid
    )

    while (responseBody.result === 'Pending in queue') {
      await delay(3000)
      responseBody = await checkProxyVerificationStatus(
        etherscanApiEndpoints,
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
