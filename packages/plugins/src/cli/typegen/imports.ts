import { findAll } from 'solidity-ast/utils'
import { SourceUnit, VariableDeclaration } from 'solidity-ast/types'

import { fetchTypeForUserDefinedType } from './functions'

const resolveRemappingOnImportPath = (
  importPath: string,
  remappings: Record<string, string>
) => {
  for (const [target, prefix] of Object.entries(remappings)) {
    if (importPath.startsWith(prefix)) {
      return importPath.replace(prefix, target)
    }
  }
}

const generateImportPath = (
  absolutePath: string,
  remappings: Record<string, string>
) => {
  const remappedPath = resolveRemappingOnImportPath(absolutePath, remappings)

  // If there was a remapping that matched the import path, then use that
  // otherwise, use the current file depth to construct an import path using the absolute path
  const path = remappedPath !== undefined ? remappedPath : absolutePath
  return path
}

const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export const fetchUniqueTypeName = (
  currentImports: Record<string, string>,
  localName: string,
  path: string,
  sourceFilePath: string,
  src: string
) => {
  const uniqueName =
    // If the local name is already defined in the current imports
    currentImports[localName] !== undefined &&
    // And the current import path is not the same as the path for the current import
    // Then we need to generate a unique name for the import using the source file path
    !currentImports[localName].includes(path)
      ? `${sourceFilePath
          .replace(src + '/', '')
          .split('/')
          .map((str) => capitalizeFirstLetter(str))
          .join('')}_${localName}`.replace('.sol', '')
      : localName

  return uniqueName
}

const fetchImportForType = (
  localName: string,
  sourceUnit: SourceUnit,
  sourceFilePath: string,
  remappings: Record<string, string>,
  currentImports: Record<string, string>,
  src: string
) => {
  for (const importDirective of findAll('ImportDirective', sourceUnit)) {
    const typeImport = importDirective.symbolAliases.find(
      (alias) =>
        alias.local === localName ||
        (alias.foreign.name === localName && alias.local === undefined)
    )

    if (typeImport) {
      const path = generateImportPath(importDirective.absolutePath, remappings)

      const uniqueName = fetchUniqueTypeName(
        currentImports,
        localName,
        path,
        sourceFilePath,
        src
      )

      if (typeImport.local === localName) {
        const alias =
          typeImport.local !== uniqueName ? uniqueName : typeImport.local
        return {
          importString: `import { ${typeImport.foreign.name} as ${alias} } from "${path}";`,
          uniqueName,
        }
      } else {
        const alias =
          typeImport.foreign.name !== uniqueName
            ? `${typeImport.foreign.name} as ${uniqueName}`
            : typeImport.foreign.name
        return {
          importString: `import { ${alias} } from "${path}";`,
          uniqueName,
        }
      }
    }
  }
}

export const generateImportsFromVariableDeclarations = (
  variableDeclarations: VariableDeclaration[],
  sourceUnit: SourceUnit,
  sourceFilePath: string,
  remappings: Record<string, string>,
  currentImports: Record<string, string>,
  src: string
) => {
  const newImports: Record<string, string> = {}
  const duplicates: Record<string, string> = {}
  for (const variable of variableDeclarations) {
    // We only need to generate imports for user defined types
    if (
      variable.typeName?.nodeType === 'UserDefinedTypeName' ||
      (variable.typeName?.nodeType === 'ArrayTypeName' &&
        variable.typeName.baseType.nodeType === 'UserDefinedTypeName')
    ) {
      if (variable.typeName.typeDescriptions.typeString?.includes('contract')) {
        // If item is contract
        // TODO: Generate import for the respective client
      } else {
        // else if item is struct, enum, or user defined type

        const type = fetchTypeForUserDefinedType(variable)
        if (type) {
          // Slice out the parent type name
          // If there is no parent type, then this will be the actual type name which is fine b/c
          // it causes the following logic to handle the case where the type is imported directly or defined in the same file
          const localName = type.split(' ').at(-1)?.split('.')[0]

          if (!localName) {
            throw new Error(
              `Unable to fetch local name for type string: ${variable.typeName.typeDescriptions.typeString}`
            )
          }

          // Fetch the import statement for the parent type and the alias if any
          const importData = fetchImportForType(
            localName,
            sourceUnit,
            sourceFilePath,
            remappings,
            currentImports,
            src
          )

          if (importData) {
            const { importString, uniqueName } = importData
            // If there is an import statement for the parent type, then generate an import statement for
            // that type from the original source
            newImports[uniqueName] = importString
            duplicates[localName] = uniqueName
          } else {
            // Else if there was no import statement then the parent type must be defined in the same file
            // so generate an import statement for that type from the current original contract source file

            const path = generateImportPath(sourceFilePath, remappings)

            const uniqueName = fetchUniqueTypeName(
              currentImports,
              localName,
              path,
              sourceFilePath,
              src
            )

            newImports[uniqueName] = `import { ${
              localName === uniqueName
                ? localName
                : `${localName} as ${uniqueName}`
            } } from "${path}";`
            duplicates[localName] = uniqueName
          }
        } else {
          // TODO: In what case is this triggered?
          throw new Error(
            "No type string for user defined type's name when generating imports. This should never happen. Please report this as a bug."
          )
        }
      }
    }
  }

  return { newImports, duplicates }
}
