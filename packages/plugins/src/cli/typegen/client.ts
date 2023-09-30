import path from 'path'
import fs, { readdirSync } from 'fs'

import { findAll } from 'solidity-ast/utils'
import {
  ContractDefinition,
  FunctionDefinition,
  SourceUnit,
} from 'solidity-ast/types'
import ora from 'ora'
import { execAsync } from '@sphinx-labs/core'

import {
  generateDeploymentFunctionFromASTDefinition,
  generateFunctionFromASTDefinition,
} from './functions'
import { getFoundryConfigOptions } from '../../foundry/options'
import { fetchUniqueTypeName } from './imports'

// Maybe:
// - handle using contract clients when the input type is a contract instead of just converting it to an address
// - handle if an external contract is used for an input/output value in a function or constructor

const CLIENT_FOLDER_NAME = 'SphinxClient'

const generateClientContractFromArtifact = async (
  artifactFile: string,
  filePath: string,
  fileDepth: number,
  remappings: Record<string, string>,
  allDeployFunctionImports: Record<string, string>,
  clientPath: string,
  src: string
) => {
  const fileName = path.basename(filePath)
  const contractName = path.basename(artifactFile).replace('.json', '')
  const clientName = `${contractName}Client`

  const uniqueClientName = fetchUniqueTypeName(
    allDeployFunctionImports,
    clientName,
    clientPath,
    filePath,
    src
  )

  const artifact = JSON.parse(fs.readFileSync(artifactFile, 'utf-8'))
  const sourceUnit: SourceUnit = artifact.ast
  const astNodes = artifact.ast.nodes
  const contractDefinition: ContractDefinition = astNodes.find(
    (node) =>
      node.nodeType === 'ContractDefinition' &&
      node.canonicalName === contractName
  )

  // If the absolute path from the artifact does not match the file path,
  // then this artifact is for a file with the same name but in a different folder
  // so we should skip it
  if (sourceUnit.absolutePath !== filePath) {
    return undefined
  }

  // If there is no contract definition, then we don't need to generate a client so we skip this file
  if (!contractDefinition) {
    return undefined
  }

  // If the definition is a library or interface, then we don't need to generate a client so we skip this file
  if (contractDefinition.contractKind !== 'contract') {
    return undefined
  }

  const functionDefinitions = contractDefinition.nodes
    // filter for only function definitions
    .filter((node) => node.nodeType === 'FunctionDefinition')
    // filter out constructor
    .filter((definition: FunctionDefinition) => definition.kind === 'function')
    // filter for only external and public functions
    .filter(
      (definition: FunctionDefinition) =>
        definition.visibility === 'external' ||
        definition.visibility === 'public'
    )
    // filter out any functions that have are mutable and accept function inputs
    .filter(
      (definition: FunctionDefinition) =>
        definition.stateMutability === 'pure' ||
        definition.parameters.parameters.filter(
          (parameter) => parameter.typeName?.nodeType === 'FunctionTypeName'
        ).length === 0
    )

  const fullyQualifiedContractName = `${filePath}:${contractName}`

  const importsAndDefinitions = functionDefinitions.map(
    (definition: FunctionDefinition) =>
      generateFunctionFromASTDefinition(
        definition,
        sourceUnit,
        filePath,
        fileDepth,
        remappings,
        src,
        fullyQualifiedContractName
      )
  )

  const clientImports: Record<string, string> = {}
  const allFunctionDefinitions: string[] = []
  importsAndDefinitions.forEach((importAndDefinition) => {
    const { imports, functionDefinition } = importAndDefinition
    allFunctionDefinitions.push(functionDefinition)

    for (const [localName, importString] of Object.entries(imports)) {
      clientImports[localName] = importString
    }
  })

  const clientContract = `contract ${uniqueClientName} is AbstractContractClient {
  constructor(address _sphinxManager, address _sphinx, address _impl) AbstractContractClient(_sphinxManager, _sphinx, _impl) {}

  fallback() external override {
    require(msg.sender != sphinxInternalManager, "User attempted to call a non-existent function on ${uniqueClientName}");
    _delegate(sphinxInternalImpl);
  }

  ${allFunctionDefinitions.join('')}
}
`

  const constructorDefinition: any = contractDefinition.nodes.find(
    (node) =>
      node.nodeType === 'FunctionDefinition' && node.kind === 'constructor'
  )

  const artifactPath = `${fileName}:${contractName}`
  const clientArtifactPath = `${fileName.replace(
    '.sol',
    '.SphinxClient.sol'
  )}:${uniqueClientName}`

  const {
    imports: deployFunctionImports,
    functionDefinitions: deployFunctions,
  } = generateDeploymentFunctionFromASTDefinition(
    constructorDefinition,
    uniqueClientName,
    artifactPath,
    clientArtifactPath,
    fullyQualifiedContractName,
    sourceUnit,
    filePath,
    remappings,
    allDeployFunctionImports,
    src
  )

  return {
    uniqueClientName,
    clientContract,
    clientImports,
    deployFunctions,
    deployFunctionImports,
  }
}

export const generateClientForFile = async (
  filePath: string,
  artifactFolder: string,
  outputPath: string,
  fileDepth: number,
  remappings: Record<string, string>,
  allDeployFunctionImports: Record<string, string>,
  src: string
) => {
  const fileName = path.basename(filePath)

  const fileArtifactPath = path.join(artifactFolder, fileName)
  const artifactFiles = fs.readdirSync(fileArtifactPath)

  const contracts: Array<{
    uniqueClientName: string
    clientContract: string
    clientImports: Record<string, string>
    deployFunctions: string
    deployFunctionImports: Record<string, string>
  }> = []
  for (const file of artifactFiles) {
    const contract = await generateClientContractFromArtifact(
      path.join(artifactFolder, fileName, file),
      filePath,
      fileDepth,
      remappings,
      allDeployFunctionImports,
      outputPath,
      src
    )

    if (contract !== undefined) {
      contracts.push(contract)
    }
  }

  const uniqueClientNames: string[] = []
  const clientContracts: string[] = []
  const consolidatedClientImports: Record<string, string> = {}
  const consolidatedDeployFunctions: string[] = []
  const consolidatedDeployFunctionImports: Record<string, string> = {}

  // Consolidate all of the imports and contracts into arrays and objects
  // Remove any duplicate imports
  contracts.forEach((contract) => {
    const {
      uniqueClientName,
      clientContract,
      clientImports,
      deployFunctions,
      deployFunctionImports,
    } = contract
    uniqueClientNames.push(uniqueClientName)
    clientContracts.push(clientContract)
    consolidatedDeployFunctions.push(deployFunctions)

    for (const [localName, importString] of Object.entries(clientImports)) {
      consolidatedClientImports[localName] = importString
    }

    for (const [localName, importString] of Object.entries(
      deployFunctionImports
    )) {
      consolidatedDeployFunctionImports[localName] = importString
    }
  })

  // Join all of the contract sources into a single string
  const contractClientSrc = clientContracts.join('\n')

  // Add in the imports for the clients themselves
  for (const clientName of uniqueClientNames) {
    consolidatedDeployFunctionImports[
      clientName
    ] = `import { ${clientName} } from "./${outputPath.replace(
      `${CLIENT_FOLDER_NAME}/`,
      ''
    )}";`
  }

  // Generate the final contract client source file
  const clientSource = `// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY
// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { Sphinx } from "@sphinx-labs/plugins/Sphinx.sol";
import { AbstractContractClient } from "@sphinx-labs/plugins/AbstractContractClient.sol";
${
  Object.values(consolidatedClientImports).length > 0
    ? Object.values(consolidatedClientImports).join('\n') + '\n'
    : ''
}
${contractClientSrc}
`

  const fullOutputPath = path.resolve(outputPath)
  fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true })
  fs.writeFileSync(fullOutputPath, clientSource)

  return {
    deployFunctionImports: consolidatedDeployFunctionImports,
    deployFunctions: consolidatedDeployFunctions,
    clientSource,
  }
}

export const generateClientsInFolder = async (
  folder: string,
  artifactFolder: string,
  outputPath: string,
  fileDepth: number,
  remappings: Record<string, string>,
  src: string,
  allDeployFunctionImports: Record<string, string>,
  allDeployFunctions: string[]
) => {
  const subdirs: string[] = []
  const files: string[] = []
  readdirSync(folder, { withFileTypes: true }).map((dirent) => {
    if (dirent.isDirectory()) {
      subdirs.push(dirent.name)
    } else {
      files.push(dirent.name)
    }
  })

  for (const subdir of subdirs) {
    const subdirOutputPath = path.join(outputPath, subdir)
    const subdirPath = path.join(folder, subdir)
    await generateClientsInFolder(
      subdirPath,
      artifactFolder,
      subdirOutputPath,
      fileDepth + 1,
      remappings,
      src,
      allDeployFunctionImports,
      allDeployFunctions
    )
  }

  for (const file of files) {
    // Skip the sphinx external contract since it's handled separately
    if (file === 'SphinxExternal.sol') {
      continue
    }

    const filePath = path.join(folder, file)
    const outputFileName = file.replace('.sol', `.${CLIENT_FOLDER_NAME}.sol`)
    const outputFilePath = path.join(outputPath, outputFileName)
    const { deployFunctionImports, deployFunctions } =
      await generateClientForFile(
        filePath,
        artifactFolder,
        outputFilePath,
        fileDepth,
        remappings,
        allDeployFunctionImports,
        src
      )

    for (const [localName, importString] of Object.entries(
      deployFunctionImports
    )) {
      allDeployFunctionImports[localName] = importString
    }

    allDeployFunctions.push(...deployFunctions)
  }

  return {
    deployFunctionImports: allDeployFunctionImports,
    deployFunctions: allDeployFunctions,
  }
}

export const generateClientsForExternalContracts = async (
  src: string,
  artifactFolder: string,
  outputPath: string,
  fileDepth: number,
  remappings: Record<string, string>
): Promise<{
  deployFunctionImports: Record<string, string>
  deployFunctions: string[]
}> => {
  const allDeployFunctionImports: Record<string, string> = {}
  const allDeployFunctions: string[] = []

  const externalImpostsArtifactPath = path.join(
    artifactFolder,
    'SphinxExternal.sol',
    'SphinxExternal.json'
  )

  if (!fs.existsSync(externalImpostsArtifactPath)) {
    return { deployFunctionImports: {}, deployFunctions: [] }
  }

  const artifact = JSON.parse(
    fs.readFileSync(externalImpostsArtifactPath, 'utf-8')
  )

  for (const importDirective of findAll('ImportDirective', artifact.ast)) {
    const fileName = path.basename(importDirective.absolutePath)
    const clientOutputPath = path
      .join(outputPath, fileName)
      .replace('.sol', '.SphinxClient.sol')
    const { deployFunctionImports, deployFunctions } =
      await generateClientForFile(
        importDirective.absolutePath,
        artifactFolder,
        clientOutputPath,
        fileDepth,
        remappings,
        allDeployFunctionImports,
        src
      )

    for (const [localName, importString] of Object.entries(
      deployFunctionImports
    )) {
      allDeployFunctionImports[localName] = importString
    }

    allDeployFunctions.push(...deployFunctions)
  }

  return {
    deployFunctionImports: allDeployFunctionImports,
    deployFunctions: allDeployFunctions,
  }
}

const generateSphinxClient = async (
  imports: Record<string, string>,
  deployFunctions: string[],
  clientFolder: string
) => {
  const source = `// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY
// SPDX-License-Identifier: MIT
pragma solidity >=0.7.4 <0.9.0;

import { Sphinx } from "@sphinx-labs/plugins/Sphinx.sol";
import { SphinxConfig, DeployOptions, DefineOptions } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
${Object.values(imports).join('\n')}

abstract contract SphinxClient is Sphinx {
  ${deployFunctions.join('\n')}
}
`

  const fullClientFolder = path.resolve(clientFolder)
  fs.mkdirSync(path.dirname(clientFolder), { recursive: true })
  fs.writeFileSync(
    path.join(fullClientFolder, `${CLIENT_FOLDER_NAME}.sol`),
    source
  )
}

export const generateClient = async () => {
  const spinner = ora()
  spinner.start('Compiling sources...')

  let stdout
  try {
    // Using --swc speeds up the execution of the script.
    ;({ stdout } = await execAsync(`forge build --skip test --skip script`))
  } catch ({ stderr }) {
    spinner.stop()
    console.error(`Failed compiling sources: \n${stderr.trim()}`)
    process.exit(1)
  }

  spinner.info(`Compiler output: \n${stdout.trim()}`)
  spinner.succeed('Finished compiling sources')

  spinner.start('Generating Sphinx clients...')

  const { srcDirectory, artifactFolder, remappings } =
    await getFoundryConfigOptions()
  const { deployFunctionImports, deployFunctions } =
    await generateClientsForExternalContracts(
      srcDirectory,
      artifactFolder,
      CLIENT_FOLDER_NAME,
      1,
      remappings
    )

  if (!fs.existsSync(srcDirectory)) {
    throw new Error(
      `The src directory: '${srcDirectory}' was not found. Please check that you've defined the correct src directory in your foundry.toml file.`
    )
  }

  await generateClientsInFolder(
    srcDirectory,
    artifactFolder,
    CLIENT_FOLDER_NAME,
    1,
    remappings,
    srcDirectory,
    deployFunctionImports,
    deployFunctions
  )

  await generateSphinxClient(
    deployFunctionImports,
    deployFunctions,
    CLIENT_FOLDER_NAME
  )

  spinner.succeed('Generated Sphinx clients')
  spinner.start('Compiling clients and scripts...')

  try {
    // Using --swc speeds up the execution of the script.
    ;({ stdout } = await execAsync(`forge build`))
  } catch ({ stderr }) {
    spinner.stop()
    console.error(`Failed compiling scripts: \n${stderr.trim()}`)
    process.exit(1)
  }

  spinner.info(`Compiler output: \n${stdout.trim()}`)
  spinner.succeed('Finished compiling clients and scripts')
}
