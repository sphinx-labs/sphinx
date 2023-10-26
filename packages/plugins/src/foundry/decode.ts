import { basename, join, resolve } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'

import {
  ActionInput,
  ConfigArtifacts,
  DecodedAction,
  DecodedFunctionCallActionInput,
  DeploymentInfo,
  ParsedConfig,
  ParsedVariable,
  RawDeployContractActionInput,
  RawFunctionCallActionInput,
} from '@sphinx-labs/core/dist/config/types'
import {
  isRawDeployContractActionInput,
  recursivelyConvertResult,
  spawnAsync,
} from '@sphinx-labs/core/dist/utils'
import {
  AbiCoder,
  ConstructorFragment,
  Fragment,
  Interface,
  ethers,
} from 'ethers'
import {
  SUPPORTED_NETWORKS,
  SphinxActionType,
  getCreate3Address,
  getCreate3Salt,
  networkEnumToName,
} from '@sphinx-labs/core'
import ora from 'ora'

import { FoundryDryRun, ProposalOutput } from './types'
import { FoundryToml } from './options'

export const decodeDeploymentInfo = (
  calldata: string,
  sphinxCollectorABI: Array<any>
): DeploymentInfo => {
  const iface = new Interface(sphinxCollectorABI)
  const deploymentInfoFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'collectDeploymentInfo')

  if (!deploymentInfoFragment) {
    throw new Error(
      `'collectDeploymentInfo' not found in ABI. Should never happen.`
    )
  }

  const abiEncodedDeploymentInfo = ethers.dataSlice(calldata, 4)

  const coder = AbiCoder.defaultAbiCoder()

  const deploymentInfoResult = coder.decode(
    deploymentInfoFragment.inputs,
    abiEncodedDeploymentInfo
  )

  const [deploymentInfoBigInt] = recursivelyConvertResult(
    deploymentInfoFragment.inputs,
    deploymentInfoResult
  ) as any

  const {
    authAddress,
    managerAddress,
    chainId,
    initialState,
    isLiveNetwork,
    newConfig,
  } = deploymentInfoBigInt

  return {
    authAddress,
    managerAddress,
    chainId: chainId.toString(),
    initialState: {
      ...initialState,
      version: {
        major: initialState.version.major.toString(),
        minor: initialState.version.minor.toString(),
        patch: initialState.version.patch.toString(),
      },
    },
    isLiveNetwork,
    newConfig: {
      ...newConfig,
      testnets: newConfig.testnets.map(networkEnumToName),
      mainnets: newConfig.mainnets.map(networkEnumToName),
      threshold: newConfig.threshold.toString(),
      version: {
        major: newConfig.version.major.toString(),
        minor: newConfig.version.minor.toString(),
        patch: newConfig.version.patch.toString(),
      },
    },
  }
}

export const decodeDeploymentInfoArray = (
  abiEncodedDeploymentInfoArray: string,
  abi: Array<any>
): Array<DeploymentInfo> => {
  const iface = new Interface(abi)
  const deploymentInfoFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'getDeploymentInfoArray')

  if (!deploymentInfoFragment) {
    throw new Error(
      `'getDeploymentInfoArray' not found in ABI. Should never happen.`
    )
  }

  const deploymentInfoResultArray = AbiCoder.defaultAbiCoder().decode(
    deploymentInfoFragment.outputs,
    abiEncodedDeploymentInfoArray
  )

  const { deploymentInfoArray } = recursivelyConvertResult(
    deploymentInfoFragment.outputs,
    deploymentInfoResultArray
  ) as any

  return deploymentInfoArray as Array<DeploymentInfo>
}

export const decodeProposalOutput = (
  abiEncodedProposalOutput: string,
  abi: Array<any>
): ProposalOutput => {
  const iface = new Interface(abi)
  const proposalOutputFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'proposalOutput')

  if (!proposalOutputFragment) {
    throw new Error(`'proposalOutput' not found in ABI. Should never happen.`)
  }

  const coder = AbiCoder.defaultAbiCoder()

  const proposalOutputResult = coder.decode(
    proposalOutputFragment.outputs,
    abiEncodedProposalOutput
  )

  const { output } = recursivelyConvertResult(
    proposalOutputFragment.outputs,
    proposalOutputResult
  ) as any

  for (const bundleInfo of output.bundleInfoArray) {
    bundleInfo.compilerConfig = JSON.parse(bundleInfo.compilerConfigStr)
    delete bundleInfo.compilerConfigStr
  }

  return output as ProposalOutput
}

export const readCollectedProposal = (
  networkNames: Array<string>,
  scriptPath: string,
  broadcastFolder: string,
  sphinxCollectorABI: Array<any>
): Array<{
  deploymentInfo: DeploymentInfo
  actionInputs: Array<RawDeployContractActionInput | RawFunctionCallActionInput>
}> => {
  networkNames
  scriptPath
  broadcastFolder
  sphinxCollectorABI

  const collected: Array<{
    deploymentInfo: DeploymentInfo
    actionInputs: Array<
      RawDeployContractActionInput | RawFunctionCallActionInput
    >
  }> = []

  if (networkNames.length === 1) {
    return [
      getCollectedSingleChainDeployment(
        networkNames[0],
        scriptPath,
        broadcastFolder,
        sphinxCollectorABI,
        'sphinxCollectProposal'
      ),
    ]
  } else {
    // TODO(docs): e.g. broadcast/multi/dry-run/Sample.s.sol-latest/sphinxCollectProposal.json
    const dryRunPath = join(
      broadcastFolder,
      'multi',
      'dry-run',
      `${basename(scriptPath)}-latest`,
      'sphinxCollectProposal.json'
    )

    const multichainDryRun: Array<FoundryDryRun> = JSON.parse(
      readFileSync(dryRunPath, 'utf8')
    ).deployments

    for (const dryRun of multichainDryRun) {
      collected.push(parseFoundryDryRun(dryRun, sphinxCollectorABI))
    }
  }

  return collected
}

export const getCollectedSingleChainDeployment = (
  networkName: string,
  scriptPath: string,
  broadcastFolder: string,
  sphinxCollectorABI: Array<any>,
  sphinxFunctionName: string
): {
  deploymentInfo: DeploymentInfo
  actionInputs: Array<RawDeployContractActionInput | RawFunctionCallActionInput>
} => {
  const chainId = SUPPORTED_NETWORKS[networkName]

  // TODO(docs): location: e.g. hello_foundry/broadcast/Counter.s.sol/31337/dry-run/sphinxCollectDeployment-latest.json
  // TODO(docs): Foundry uses only the script's file name when writing the dry run to the
  // filesystem, even if the script is in a subdirectory (e.g. script/my/path/MyScript.s.sol).
  const dryRunPath = join(
    broadcastFolder,
    basename(scriptPath),
    chainId.toString(),
    'dry-run',
    `${sphinxFunctionName}-latest.json`
  )

  const dryRun: FoundryDryRun = JSON.parse(readFileSync(dryRunPath, 'utf8'))
  return parseFoundryDryRun(dryRun, sphinxCollectorABI)
}

const parseFoundryDryRun = (
  dryRun: FoundryDryRun,
  sphinxCollectorABI: Array<any>
): {
  deploymentInfo: DeploymentInfo
  actionInputs: Array<RawDeployContractActionInput | RawFunctionCallActionInput>
} => {
  const deploymentInfo = decodeDeploymentInfo(
    dryRun.transactions[0].transaction.data,
    sphinxCollectorABI
  )
  const transactions = dryRun.transactions.slice(1)

  const notFromSphinxManager = transactions.filter(
    (t) =>
      // TODO(docs): `getAddress` returns the checksummed addresses
      ethers.getAddress(t.transaction.from) !== deploymentInfo.managerAddress
  )
  if (notFromSphinxManager.length > 0) {
    // TODO(docs): the user must broadcast from the sphinx manager's address so that the msg.sender
    // for function calls is the same as it would be in a production deployment.
    throw new Error(`TODO`)
  }

  // TODO(md): current limitations: cannot send eth as part of deployment.

  const actionInputs: Array<
    RawDeployContractActionInput | RawFunctionCallActionInput
  > = []
  for (const { transaction } of transactions) {
    if (transaction.value !== '0x0') {
      throw new Error(
        `Sphinx does not support sending ETH during deployments. Let us know if you need this feature!`
      )
    }

    if (
      transaction.to !== undefined &&
      ethers.getAddress(transaction.to) === deploymentInfo.managerAddress
    ) {
      actionInputs.push(
        decodeDeployContractActionInput(transaction.data, sphinxCollectorABI)
      )
    } else if (transaction.to) {
      actionInputs.push({
        actionType: SphinxActionType.CALL.toString(),
        skip: false,
        to: ethers.getAddress(transaction.to),
        data: transaction.data,
      })
    } else {
      throw new Error(`TODO(docs): should never happen`)
    }
  }

  return { deploymentInfo, actionInputs }
}

export const decodeDeployContractActionInput = (
  calldata: string,
  sphinxCollectorABI: Array<any>
): RawDeployContractActionInput => {
  const iface = new Interface(sphinxCollectorABI)
  const deployFragment = iface.fragments
    .filter(Fragment.isFunction)
    .find((fragment) => fragment.name === 'deploy')

  if (!deployFragment) {
    throw new Error(`'deploy' function not found in ABI. Should never happen.`)
  }

  const abiEncodedAction = ethers.dataSlice(calldata, 4)

  const coder = AbiCoder.defaultAbiCoder()

  const actionResult = coder.decode(deployFragment.inputs, abiEncodedAction)

  const action = recursivelyConvertResult(
    deployFragment.inputs,
    actionResult
  ) as any

  return {
    ...action,
    skip: false,
    actionType: SphinxActionType.DEPLOY_CONTRACT.toString(),
  }
}

export const makeParsedConfig = (
  deploymentInfo: DeploymentInfo,
  rawInputs: Array<RawDeployContractActionInput | RawFunctionCallActionInput>,
  configArtifacts: ConfigArtifacts
): ParsedConfig => {
  const {
    authAddress,
    managerAddress,
    chainId,
    newConfig,
    isLiveNetwork,
    initialState,
  } = deploymentInfo

  const coder = ethers.AbiCoder.defaultAbiCoder()
  const actionInputs: Array<ActionInput> = []
  for (const input of rawInputs) {
    if (isRawDeployContractActionInput(input)) {
      const create3Salt = getCreate3Salt(input.referenceName, input.userSalt)
      const create3Address = getCreate3Address(managerAddress, create3Salt)

      const { abi } = configArtifacts[input.fullyQualifiedName].artifact
      const iface = new ethers.Interface(abi)
      const constructorFragment = iface.fragments.find(
        ConstructorFragment.isFragment
      )
      let decodedConstructorArgs: ParsedVariable
      if (constructorFragment) {
        const decodedResult = coder.decode(
          constructorFragment.inputs,
          input.constructorArgs
        )
        // Convert from an Ethers `Result` into a plain object.
        decodedConstructorArgs = recursivelyConvertResult(
          constructorFragment.inputs,
          decodedResult
        ) as ParsedVariable
      } else {
        decodedConstructorArgs = {}
      }

      const decodedAction: DecodedAction = {
        referenceName: input.referenceName,
        functionName: 'constructor',
        variables: decodedConstructorArgs,
      }
      actionInputs.push({ create3Address, decodedAction, ...input })
    } else {
      const targetContractActionInput = rawInputs
        .filter(isRawDeployContractActionInput)
        .find(
          (a) =>
            input.to ===
            getCreate3Address(
              managerAddress,
              getCreate3Salt(a.referenceName, a.userSalt)
            )
        )

      if (targetContractActionInput) {
        const { fullyQualifiedName, referenceName } = targetContractActionInput
        const { abi } = configArtifacts[fullyQualifiedName].artifact
        const iface = new ethers.Interface(abi)

        const selector = ethers.dataSlice(input.data, 0, 4)
        const functionParamsResult = iface.decodeFunctionData(
          selector,
          input.data
        )
        const functionFragment = iface.getFunction(selector)
        if (!functionFragment) {
          throw new Error(
            `Could not find function fragment for selector: ${selector}. Should never happen.`
          )
        }

        // Convert the Ethers `Result` into a plain object.
        const decodedFunctionParams = recursivelyConvertResult(
          functionFragment.inputs,
          functionParamsResult
        ) as ParsedVariable

        const functionName = iface.getFunctionName(selector)

        const decodedAction: DecodedAction = {
          referenceName,
          functionName,
          variables: decodedFunctionParams,
        }
        const decodedCall: DecodedFunctionCallActionInput = {
          decodedAction,
          fullyQualifiedName,
          referenceName,
          ...input,
        }
        actionInputs.push(decodedCall)
      } else {
        actionInputs.push(input)
      }
    }
  }

  return {
    authAddress,
    managerAddress,
    chainId,
    newConfig,
    isLiveNetwork,
    initialState,
    actionInputs,
    remoteExecution: !isLiveNetwork, // TODO(docs)
  }
}

export const collectProposal = async (
  isTestnet: boolean,
  proposerAddress: string,
  scriptPath: string,
  foundryToml: FoundryToml,
  targetContract?: string,
  spinner = ora({ isSilent: true })
): Promise<
  Array<{
    deploymentInfo: DeploymentInfo
    actionInputs: Array<
      RawDeployContractActionInput | RawFunctionCallActionInput
    >
  }>
> => {
  const proposalNetworksPath = join(
    foundryToml.cachePath,
    'sphinx-proposal-networks.txt'
  )

  // Delete the proposal networks file if it already exists. This isn't strictly necessary, since an
  // existing file would be overwritten automatically when we call `sphinxProposeTask`, but this
  // ensures that we don't accidentally use outdated networks in the rest of the proposal.
  if (existsSync(proposalNetworksPath)) {
    unlinkSync(proposalNetworksPath)
  }

  const forgeScriptCollectArgs = [
    'script',
    scriptPath,
    '--sig',
    'sphinxCollectProposal(address,bool,string)',
    proposerAddress,
    isTestnet.toString(),
    proposalNetworksPath,
    '--skip-simulation', // TODO(docs): this is necessary in the case that a deployment has already occurred on the network. explain why. also, this skips the on-chain simulation, not the in-process simulation (i.e. step 2 in forge docs, not step 1)
  ]
  if (targetContract) {
    forgeScriptCollectArgs.push('--target-contract', targetContract)
  }

  const spawnOutput = await spawnAsync('forge', forgeScriptCollectArgs)

  if (spawnOutput.code !== 0) {
    spinner.stop()
    // The `stdout` contains the trace of the error.
    console.log(spawnOutput.stdout)
    // The `stderr` contains the error message.
    console.log(spawnOutput.stderr)
    process.exit(1)
  }

  const allNetworksStr = readFileSync(proposalNetworksPath, 'utf8')
  const networks = allNetworksStr.split(',')

  // We must load this ABI after running `forge build` to prevent a situation where the user clears
  // their artifacts then calls this task, in which case the artifact won't exist yet.
  const sphinxCollectorABI =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(resolve(
      `${foundryToml.artifactFolder}/SphinxCollector.sol/SphinxCollector.json`
    )).abi

  return readCollectedProposal(
    networks,
    scriptPath,
    foundryToml.broadcastFolder,
    sphinxCollectorABI
  )
}
