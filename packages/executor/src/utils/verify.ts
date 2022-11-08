import assert from 'assert'

import { Contract } from 'ethers'
import {
  CompilerInput,
  getChugSplashManagerProxyAddress,
} from '@chugsplash/core'
import { getConstructorArgs } from '@chugsplash/plugins'
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
import { ChugSplashManagerABI } from '@chugsplash/contracts'

import {
  fetchChugSplashConfig,
  getArtifactsFromCanonicalConfig,
} from './compile'

const configUri = 'ipfs://QmTRsjAVxyQPzJMmH9omwRpfSNtZtXccGsQ5xH8Cxo82aC'

export const verifyChugSplashConfig = async (hre: any) => {
  const { etherscan } = hre.config

  const canonicalConfig = await fetchChugSplashConfig(configUri)
  const artifacts = await getArtifactsFromCanonicalConfig(hre, canonicalConfig)

  const ChugSplashManager = new Contract(
    getChugSplashManagerProxyAddress(canonicalConfig.options.projectName),
    ChugSplashManagerABI,
    hre.ethers.provider
  )

  for (const [referenceName, contractConfig] of Object.entries(
    canonicalConfig.contracts
  )) {
    const artifact = artifacts[contractConfig.contract]
    const { abi, contractName, sourceName, sources, immutableReferences } =
      artifact
    const { constructorArgValues } = await getConstructorArgs(
      canonicalConfig,
      referenceName,
      abi,
      sources,
      immutableReferences
    )

    const address = await ChugSplashManager.implementations(referenceName)

    const { network: verificationNetwork, urls: etherscanApiEndpoints } =
      await hre.run(TASK_VERIFY_GET_ETHERSCAN_ENDPOINT)

    const etherscanApiKey = resolveEtherscanApiKey(
      etherscan.apiKey,
      verificationNetwork
    )

    const compilerInput = canonicalConfig.inputs.find((compilerInputs) =>
      Object.keys(compilerInputs.input.sources).includes(sourceName)
    )

    const deployedBytecodeHex = await retrieveContractBytecode(
      address,
      hre.network.provider,
      hre.network.name
    )
    const deployedBytecode = new Bytecode(deployedBytecodeHex)
    const solcVersion = deployedBytecode.getInferredSolcVersion()

    assert(
      solcVersion === compilerInput.solcVersion,
      'Compiler version in artifact does not match deployed contract compiler version'
    )

    const deployArgumentsEncoded = await encodeArguments(
      abi,
      sourceName,
      contractName,
      constructorArgValues
    )

    const solcFullVersion = await getLongVersion(solcVersion)

    const verificationStatus = await attemptVerification(
      etherscanApiEndpoints,
      address,
      sourceName,
      contractName,
      etherscanApiKey,
      compilerInput.input,
      solcFullVersion,
      deployArgumentsEncoded
    )

    if (verificationStatus.isVerificationSuccess()) {
      const contractURL = buildContractUrl(
        etherscanApiEndpoints.browserURL,
        address
      )
      console.log(
        `Successfully verified ${contractName} on Etherscan:
        ${contractURL}`
      )
    }
  }
}

export const attemptVerification = async (
  etherscanAPIEndpoints: EtherscanURLs,
  contractAddress: string,
  sourceName: string,
  contractName: string,
  etherscanApiKey: string,
  compilerInput: CompilerInput,
  solcFullVersion: string,
  deployArgumentsEncoded: string
): Promise<EtherscanResponse> => {
  const request = toVerifyRequest({
    apiKey: etherscanApiKey,
    contractAddress,
    sourceCode: JSON.stringify(compilerInput),
    sourceName,
    contractName,
    compilerVersion: solcFullVersion,
    constructorArguments: deployArgumentsEncoded,
  })
  const response = await verifyContract(etherscanAPIEndpoints.apiURL, request)

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
  const verificationStatus = await getVerificationStatus(
    etherscanAPIEndpoints.apiURL,
    pollRequest
  )

  if (
    verificationStatus.isVerificationFailure() ||
    verificationStatus.isVerificationSuccess()
  ) {
    return verificationStatus
  }

  // Reaching this point shouldn't be possible unless the API is behaving in a new way.
  throw new Error(
    `The Etherscan API responded with an unexpected message.
     Contract verification may have succeeded and should be checked manually.
     Message: ${verificationStatus.message}`
  )
}
