import path, { join } from 'path'
import fs, { readdirSync } from 'fs'
import { spawnSync } from 'child_process'

import { findAll } from 'solidity-ast/utils'
import { ContractDefinition, SourceUnit } from 'solidity-ast/types'
import ora from 'ora'
import { spawnAsync } from '@sphinx-labs/core'

import { generateDeploymentFunctionFromASTDefinition } from './functions'
import { getFoundryConfigOptions } from '../../foundry/options'
import { fetchUniqueTypeName } from './imports'

// Maybe:
// - handle using contract clients when the input type is a contract instead of just converting it to an address
// - handle if an external contract is used for an input/output value in a function or constructor

const CLIENT_FOLDER_NAME = 'client'

type ClientNotGeneratedReason =
  | 'library'
  | 'no contract definition'
  | 'mismatching path'

export const searchAllPossibleParentArtifactPaths = async (
  absolutePath: string,
  artifactFolder: string,
  expectedContractName: string,
  remappings: Record<string, string>,
  allDeployFunctionImports: Record<string, string>,
  clientPath: string,
  src: string,
  functionSelectors: string[],
  searchedPaths: string[],
  searchImports: boolean
): Promise<
  | {
      fullyImplemented: boolean
      deployFunctions: string
      deployFunctionImports: Record<string, string>
    }
  | undefined
> => {
  const pathPieces = absolutePath.split('/')
  let filePath: string | undefined
  for (let i = pathPieces.length - 1; i >= 0; i--) {
    filePath = filePath ? path.join(pathPieces[i], filePath) : pathPieces[i]

    const artifactFilePath = path.join(
      artifactFolder,
      filePath,
      `${expectedContractName}.json`
    )

    if (fs.existsSync(artifactFilePath)) {
      // If an artifact exists with the expected name, then we can generate the client using it

      const contractData = await generateClientContractFromArtifact(
        artifactFilePath,
        absolutePath,
        remappings,
        allDeployFunctionImports,
        clientPath
      )

      if (
        contractData === 'mismatching path' ||
        contractData === 'library' ||
        contractData === 'no contract definition'
      ) {
        continue
      }

      if (contractData) {
        return contractData
      }
    } else if (searchImports) {
      // If no artifact exists with the expected name, then it's still possible that the contract was imported
      // into the file that was imported
      // I.e Contract inherits from Parent which is imported from File which imports Parent
      // So we must search for the parent in all imports into the imported file

      const artifactFolderPath = path.join(artifactFolder, filePath)
      if (fs.existsSync(artifactFolderPath)) {
        const artifactFiles = fs.readdirSync(artifactFolderPath)

        for (const file of artifactFiles) {
          const artifact = JSON.parse(
            fs.readFileSync(path.join(artifactFolder, filePath, file), 'utf-8')
          )
          const exportedSymbols = artifact.ast.exportedSymbols

          // If the absolute path from the artifact does not match the file path, then this artifact
          // is for a file with the same name but in a different folder so we should break and continue
          // searching for the correct artifact path
          if (artifact.ast.absolutePath !== absolutePath) {
            break
          }

          // If the expected contract name is in the exported symbols, then we search all the imports
          // into this file for the expected contract name
          if (exportedSymbols[expectedContractName]) {
            const nestedImports = findAll('ImportDirective', artifact.ast)
            for (const nestedImport of nestedImports) {
              if (searchedPaths.includes(nestedImport.absolutePath)) {
                continue
              } else {
                searchedPaths.push(nestedImport.absolutePath)
              }

              const contractData = await searchAllPossibleParentArtifactPaths(
                nestedImport.absolutePath,
                artifactFolder,
                expectedContractName,
                remappings,
                allDeployFunctionImports,
                clientPath,
                src,
                functionSelectors,
                searchedPaths,
                searchImports
              )

              if (contractData) {
                return contractData
              }
            }
          }
        }
      }
    }
  }
}

const generateClientContractFromArtifact = async (
  artifactFile: string,
  filePath: string,
  remappings: Record<string, string>,
  allDeployFunctionImports: Record<string, string>,
  src: string
): Promise<
  | {
      fullyImplemented: boolean
      deployFunctions: string
      deployFunctionImports: Record<string, string>
    }
  | ClientNotGeneratedReason
> => {
  const fileName = path.basename(filePath)
  const contractName = path.basename(artifactFile).replace('.json', '')

  const uniqueContractName = fetchUniqueTypeName(
    allDeployFunctionImports,
    contractName,
    filePath,
    filePath,
    src
  )

  const artifact = JSON.parse(fs.readFileSync(artifactFile, 'utf-8'))
  const sourceUnit: SourceUnit = artifact.ast
  const astNodes = artifact.ast.nodes
  const contractDefinition: ContractDefinition = astNodes.find(
    (node) =>
      node.nodeType === 'ContractDefinition' &&
      (node.canonicalName === contractName ||
        (node.canonicalName === undefined && node.name === contractName))
  )

  // If the absolute path from the artifact does not match the file path,
  // then this artifact is for a file with the same name but in a different folder
  // so we should skip it
  if (sourceUnit.absolutePath !== filePath) {
    return 'mismatching path'
  }

  // If there is no contract definition, then we don't need to generate a deploy function so we skip this file
  if (!contractDefinition) {
    return 'no contract definition'
  }

  // If the definition is a library, then we don't need to generate a deploy function so we skip this file
  if (
    contractDefinition.contractKind === 'library' ||
    contractDefinition.contractKind === 'interface'
  ) {
    return 'library'
  }

  const constructorDefinition: any = contractDefinition.nodes.find(
    (node) =>
      node.nodeType === 'FunctionDefinition' && node.kind === 'constructor'
  )

  const artifactPath = `${fileName}:${contractName}`
  const fullyQualifiedContractName = `${filePath}:${contractName}`

  const { imports: deployFunctionImports, deployFunctions } =
    generateDeploymentFunctionFromASTDefinition(
      constructorDefinition,
      uniqueContractName,
      artifactPath,
      fullyQualifiedContractName,
      sourceUnit,
      filePath,
      remappings,
      allDeployFunctionImports,
      src
    )

  // Add in the imports for the contract itself
  if (!allDeployFunctionImports[uniqueContractName]) {
    if (uniqueContractName !== contractName) {
      allDeployFunctionImports[
        uniqueContractName
      ] = `import { ${contractName} as ${uniqueContractName} } from "${sourceUnit.absolutePath}";`
    } else {
      allDeployFunctionImports[
        uniqueContractName
      ] = `import { ${contractName} } from "${sourceUnit.absolutePath}";`
    }
  }

  return {
    fullyImplemented: contractDefinition.fullyImplemented,
    deployFunctions,
    deployFunctionImports,
  }
}

const searchAllPossibleClientArtifactPaths = async (
  filePath: string,
  artifactFolder: string,
  remappings: Record<string, string>,
  allDeployFunctionImports: Record<string, string>,
  src: string
): Promise<
  Array<{
    fullyImplemented: boolean
    deployFunctions: string
    deployFunctionImports: Record<string, string>
  }>
> => {
  const couldNotFindArtifactError = `Could not find compiler artifact for file: ${filePath}. Try running 'forge clean'. If this problem persists, please report it to the developers.`

  const pathPieces = filePath.split('/')
  let fileArtifactPath: string | undefined
  for (let i = pathPieces.length - 1; i >= 0; i--) {
    fileArtifactPath = fileArtifactPath
      ? path.join(pathPieces[i], fileArtifactPath)
      : pathPieces[i]

    const artifactFile = path.join(artifactFolder, fileArtifactPath)

    if (!fs.existsSync(artifactFile)) {
      continue
    }

    if (!fileArtifactPath) {
      throw new Error(couldNotFindArtifactError)
    }

    const completefileArtifactPath = join(artifactFolder, fileArtifactPath)
    let artifactFiles
    try {
      artifactFiles = fs.readdirSync(completefileArtifactPath)
    } catch (e) {
      if (e.message.includes('no such file or directory')) {
        throw new Error(couldNotFindArtifactError)
      } else {
        throw e
      }
    }

    let didFindCorrectArtifact = false
    const contracts: Array<{
      fullyImplemented: boolean
      deployFunctions: string
      deployFunctionImports: Record<string, string>
    }> = []
    for (const file of artifactFiles) {
      const contract = await generateClientContractFromArtifact(
        path.join(completefileArtifactPath, file),
        filePath,
        remappings,
        allDeployFunctionImports,
        src
      )

      // If the artifact is for a library, then we don't need to generate a client so we skip this file
      // but we did find the correct artifact so we can continue without an error
      if (contract === 'library' || contract === 'no contract definition') {
        didFindCorrectArtifact = true
        continue
      }

      if (contract !== 'mismatching path') {
        contracts.push(contract)
      }
    }

    if (contracts.length > 0) {
      return contracts
    } else if (didFindCorrectArtifact) {
      return []
    }
  }

  throw new Error(couldNotFindArtifactError)
}

export const generateClientForFile = async (
  filePath: string,
  artifactFolder: string,
  remappings: Record<string, string>,
  allDeployFunctionImports: Record<string, string>,
  src: string
): Promise<{
  deployFunctionImports: Record<string, string>
  deployFunctions: string[]
}> => {
  const fileName = path.basename(filePath)
  if (!fileName.endsWith('.sol')) {
    return { deployFunctionImports: {}, deployFunctions: [] }
  }

  const contracts: Array<{
    fullyImplemented: boolean
    deployFunctions: string
    deployFunctionImports: Record<string, string>
  }> = await searchAllPossibleClientArtifactPaths(
    filePath,
    artifactFolder,
    remappings,
    allDeployFunctionImports,
    src
  )

  const consolidatedDeployFunctions: string[] = []
  const consolidatedDeployFunctionImports: Record<string, string> = {}

  // Consolidate all of the imports and contracts into arrays and objects
  // Remove any duplicate imports
  for (const contract of contracts) {
    const { fullyImplemented, deployFunctions, deployFunctionImports } =
      contract

    // If contract is an abstract contract, then skip outputting it
    if (fullyImplemented === false) {
      continue
    }

    consolidatedDeployFunctions.push(deployFunctions)

    for (const [localName, importString] of Object.entries(
      deployFunctionImports
    )) {
      consolidatedDeployFunctionImports[localName] = importString
    }
  }

  return {
    deployFunctionImports: consolidatedDeployFunctionImports,
    deployFunctions: consolidatedDeployFunctions,
  }
}

export const generateClientsInFolder = async (
  folder: string,
  scriptFolder: string,
  testFolder: string,
  artifactFolder: string,
  outputPath: string,
  remappings: Record<string, string>,
  src: string,
  allDeployFunctionImports: Record<string, string>,
  allDeployFunctions: string[]
) => {
  // Skip the script and test folders
  // This can happen if the user has a script or test folder nested in their src directory
  if (folder === scriptFolder) {
    return
  }

  if (folder === testFolder) {
    return
  }

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
      scriptFolder,
      testFolder,
      artifactFolder,
      subdirOutputPath,
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

    // Skip script and test files (which aren't compiled during the generation process due to
    // `--skip script` and `--skip test`)
    if (file.endsWith('.s.sol') || file.endsWith('.t.sol')) {
      continue
    }

    const filePath = path.join(folder, file)
    const { deployFunctionImports, deployFunctions } =
      await generateClientForFile(
        filePath,
        artifactFolder,
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
import { SphinxConfig, DeployOptions } from "@sphinx-labs/plugins/SphinxPluginTypes.sol";
${Object.values(imports).join('\n')}

abstract contract SphinxClient is Sphinx {
  ${deployFunctions.join('\n')}
}
`

  const fullClientFolder = path.resolve(clientFolder)
  fs.mkdirSync(clientFolder, { recursive: true })
  fs.writeFileSync(path.join(fullClientFolder, `SphinxClient.sol`), source)
}

export const generateClient = async (
  silent?: boolean,
  skipLastCompile: boolean = false
) => {
  const spinner = ora({ isSilent: silent })
  spinner.start('Running compilation...')

  const { stdout, code } = await spawnAsync(
    'forge',
    silent ? ['build', '--silent'] : ['build']
  )
  if (code === 0) {
    spinner.stop()
    // Log any warnings to the user.
    console.log(stdout)
  } else {
    spinner.stop()
    const forgeBuildArgs = ['build', '--skip', 'test', '--skip', 'script']
    if (silent) {
      forgeBuildArgs.push('--silent')
    }
    const { status: compilationStatusSrc } = spawnSync(
      `forge`,
      forgeBuildArgs,
      {
        stdio: 'inherit',
      }
    )
    // Exit the process if compilation fails.
    if (compilationStatusSrc !== 0) {
      process.exit(1)
    }
  }

  spinner.start('Generating Sphinx clients...')

  const { src, artifactFolder, remappings, script, test } =
    await getFoundryConfigOptions()

  const srcFolder = process.env.DEV_FILE_PATH ? 'contracts/test' : src

  if (!fs.existsSync(src)) {
    throw new Error(
      `The src directory: '${src}' was not found. Please check that you've defined the correct src directory in your foundry.toml file.`
    )
  }

  const deployFunctionImports: Record<string, string> = {}
  const deployFunctions: string[] = []

  await generateClientsInFolder(
    srcFolder,
    script,
    test,
    artifactFolder,
    CLIENT_FOLDER_NAME,
    remappings,
    srcFolder,
    deployFunctionImports,
    deployFunctions
  )

  await generateSphinxClient(
    deployFunctionImports,
    deployFunctions,
    CLIENT_FOLDER_NAME
  )

  spinner.succeed('Generated clients')

  if (!skipLastCompile) {
    const finalBuildArgs = silent ? ['build', '--silent'] : ['build']
    const { status: compilationStatusScripts } = spawnSync(
      `forge`,
      finalBuildArgs,
      {
        stdio: 'inherit',
      }
    )
    // Exit the process if compilation fails.
    if (compilationStatusScripts !== 0) {
      process.exit(1)
    }
  }
}
