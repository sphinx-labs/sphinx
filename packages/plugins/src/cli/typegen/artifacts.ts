import path from 'path'
import fs, { readdirSync } from 'fs'

import { ContractDefinition, ImportDirective, SourceUnit } from 'solidity-ast'
import { findAll } from 'solidity-ast/utils'

const fetchContractsForImports = async (
  artifactFolder: string,
  imports: Generator<ImportDirective, any, unknown>,
  checkedFiles: string[]
) => {
  const contracts: string[] = []
  for (const importDirective of imports) {
    console.log('fetchContractsForImports: ')
    const fileContracts = await fetchContractNamesInFile(
      importDirective.absolutePath,
      artifactFolder,
      checkedFiles
    )

    for (const contract of fileContracts) {
      if (!contracts.includes(contract)) {
        contracts.push(contract)
      }
    }
  }

  return contracts
}

const fetchContractNamesFromArtifact = async (
  artifactFolder: string,
  artifactFile: string,
  filePath: string,
  checkedFiles: string[]
): Promise<string[]> => {
  const contractName = path.basename(artifactFile).replace('.json', '')

  const artifact = JSON.parse(fs.readFileSync(artifactFile, 'utf-8'))
  const sourceUnit: SourceUnit = artifact.ast
  const astNodes = artifact.ast.nodes
  const contractDefinition: ContractDefinition = astNodes.find(
    (node) =>
      node.nodeType === 'ContractDefinition' &&
      node.canonicalName === contractName
  )

  if (sourceUnit.absolutePath !== filePath) {
    return []
  }

  if (!contractDefinition) {
    return []
  }

  if (contractDefinition.contractKind !== 'contract') {
    return []
  }

  const imports = findAll('ImportDirective', sourceUnit)
  const importedContracts = await fetchContractsForImports(
    artifactFolder,
    imports,
    checkedFiles
  )

  return [`${filePath}:${contractName}`, ...importedContracts]
}

const fetchContractNamesInFile = async (
  filePath: string,
  artifactFolder: string,
  checkedFiles: string[]
) => {
  if (checkedFiles.includes(filePath)) {
    return []
  } else {
    checkedFiles.push(filePath)
  }

  const fileName = path.basename(filePath)
  if (!fileName.endsWith('.sol')) {
    return []
  }

  const fileArtifactPath = path.join(artifactFolder, fileName)
  let artifactFiles
  try {
    artifactFiles = fs.readdirSync(fileArtifactPath)
  } catch (e) {
    if (e.message.includes('no such file or directory')) {
      throw new Error(
        `Could not find compiler artifact for file: ${filePath}, try running 'forge build'. If this problem persists please report it to the developers.`
      )
    } else {
      throw e
    }
  }

  const contracts: string[] = []
  for (const file of artifactFiles) {
    const artifactContracts = await fetchContractNamesFromArtifact(
      artifactFolder,
      path.join(artifactFolder, fileName, file),
      filePath,
      checkedFiles
    )

    for (const contract of artifactContracts) {
      if (contract !== undefined && !contracts.includes(contract)) {
        contracts.push(contract)
      }
    }
  }

  return contracts
}

export const fetchContractNamesInFolder = async (
  folder: string,
  artifactFolder: string,
  checkedFiles: string[]
) => {
  const allContracts: string[] = []
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
    const subdirPath = path.join(folder, subdir)
    const subdirContracts = await fetchContractNamesInFolder(
      subdirPath,
      artifactFolder,
      checkedFiles
    )

    for (const contract of subdirContracts) {
      if (!allContracts.includes(contract)) {
        allContracts.push(contract)
      }
    }
  }

  for (const file of files) {
    // Skip the sphinx external contract since it's handled separately
    if (file === 'SphinxExternal.sol') {
      continue
    }

    const filePath = path.join(folder, file)
    const fileContracts = await fetchContractNamesInFile(
      filePath,
      artifactFolder,
      checkedFiles
    )

    for (const contract of fileContracts) {
      if (!allContracts.includes(contract)) {
        allContracts.push(contract)
      }
    }
  }

  return allContracts
}

export const fetchContractNamesForExternalContracts = async (
  artifactFolder: string,
  checkedFiles: string[]
): Promise<string[]> => {
  const contracts: string[] = []

  const externalImpostsArtifactPath = path.join(
    artifactFolder,
    'SphinxExternal.sol',
    'SphinxExternal.json'
  )

  if (!fs.existsSync(externalImpostsArtifactPath)) {
    return []
  }

  const artifact = JSON.parse(
    fs.readFileSync(externalImpostsArtifactPath, 'utf-8')
  )

  for (const importDirective of findAll('ImportDirective', artifact.ast)) {
    const fileContracts = await fetchContractNamesInFile(
      importDirective.absolutePath,
      artifactFolder,
      checkedFiles
    )

    for (const contract of fileContracts) {
      if (!contracts.includes(contract)) {
        contracts.push(contract)
      }
    }
  }

  return contracts
}

export const fetchSourceContractNames = async (
  artifactFolder: string,
  src: string
) => {
  const checkedFiles: string[] = []
  const contracts = await fetchContractNamesInFolder(
    src,
    artifactFolder,
    checkedFiles
  )
  const externalContracts = await fetchContractNamesForExternalContracts(
    artifactFolder,
    checkedFiles
  )

  for (const contract of externalContracts) {
    if (!contracts.includes(contract)) {
      contracts.push(contract)
    }
  }

  return contracts
}
