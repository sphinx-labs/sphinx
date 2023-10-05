import {
  SourceUnit,
  FunctionDefinition,
  VariableDeclaration,
} from 'solidity-ast/types'

import { generateImportsFromVariableDeclarations } from './imports'

export const fetchTypeForUserDefinedType = (input: VariableDeclaration) => {
  if (input.typeName?.nodeType === 'UserDefinedTypeName') {
    let type: string | undefined
    const pathNodeName = input.typeName.pathNode?.name
    const pathNodeNameIncludesParent = pathNodeName?.includes('.')

    // If the path node includes a parent type, then automatically use it since it will include any aliases used for the parent
    if (pathNodeNameIncludesParent) {
      type = pathNodeName
    } else {
      const typeName = input.typeDescriptions.typeString
        ?.replace('struct ', '')
        .replace('enum ', '')
      const typeNameIncludesParent = typeName?.includes('.')

      // The only case where the type name includes a parent and the pathnode does not is when the parent is the same contract
      // as where the type is used. So in this case, we use the type name since we're going to import the type from the original source contract.
      if (typeNameIncludesParent) {
        type = typeName
      } else {
        // If both the type name and the path node do not include a parent, then we use the path node name
        // since it will use any alias used when importing the type.
        type = pathNodeName
      }
    }

    return type
  } else {
    throw new Error(
      'fetchTypeForUserDefinedType: Input variable is not a user defined type. This should never happen, please report this as a bug.'
    )
  }
}

const formatParameters = (
  parameters: VariableDeclaration[],
  includeStorageLocation: boolean,
  includeType: boolean,
  includeName: boolean,
  joinString: string = ', ',
  duplicates: Record<string, string> = {}
) => {
  let unnamedParameterCount = 0
  return parameters
    .map((input) => {
      const nameAll =
        input.name === '' ? `unnamed${unnamedParameterCount}` : input.name

      if (input.name === '') {
        unnamedParameterCount++
      }

      const storageLocationTag =
        input.storageLocation !== 'default' && includeStorageLocation
          ? `${input.storageLocation} `
          : ''
      const name = includeName ? nameAll : ''

      let type: string | undefined
      if (input?.typeDescriptions?.typeString?.includes('contract')) {
        // TODO - handle using the actual client here instead of just replacing with an address
        const typeString =
          input?.typeName?.nodeType === 'ArrayTypeName'
            ? input.typeName.baseType.typeDescriptions.typeString
            : input.typeName?.typeDescriptions.typeString

        if (typeString) {
          type = input.typeDescriptions.typeString.replace(
            typeString,
            'address'
          )
        }
      } else if (input.typeName?.nodeType === 'UserDefinedTypeName') {
        type = fetchTypeForUserDefinedType(input)

        // If the type is a user defined type, then replace any aliases used for the parent type with the unique name if necessary
        for (const [key, value] of Object.entries(duplicates)) {
          if (type === key || type?.includes(`${key}.`)) {
            type = type.replace(key, value)
          }
        }
      } else {
        type = input.typeDescriptions.typeString ?? undefined
      }

      if (type === undefined) {
        throw new Error(
          `Unable to generate parameter string for parameter ${input.name}. This should never happen, please report this as a bug.`
        )
      }

      const includedType = includeType ? `${type}` : ''
      return `${includedType} ${storageLocationTag}${name}`.trim()
    })
    .join(joinString)
}

export const generateDeploymentFunctionFromASTDefinition = (
  definition: FunctionDefinition,
  uniqueClientName: string,
  artifactPath: string,
  clientArtifactPath: string,
  fullyQualifiedName: string,
  sourceUnit: SourceUnit,
  sourceFilePath: string,
  remappings: Record<string, string>,
  allDeployFunctionImports: Record<string, string>,
  src: string
) => {
  const inputParams = definition?.parameters?.parameters

  const { newImports: imports, duplicates } =
    generateImportsFromVariableDeclarations(
      inputParams ?? [],
      sourceUnit,
      sourceFilePath,
      1,
      remappings,
      allDeployFunctionImports,
      src
    )

  const contractName = uniqueClientName.replace('Client', '')

  const inputs = inputParams
    ? formatParameters(inputParams, true, true, true, ',\n    ', duplicates)
    : ''

  const inputNames = inputParams
    ? formatParameters(inputParams, false, false, true, ',\n      ', duplicates)
    : ''

  const functionDefinitions = `
  function define${contractName}(
    address addr
  ) internal returns (${uniqueClientName}) {
    return define${contractName}(
      addr, DefineOptions({ referenceName: "${contractName}" })
    );
  }

  function define${contractName}(
    address addr,
    DefineOptions memory _defineOptions
  ) internal returns (${uniqueClientName}) {
    return ${uniqueClientName}(
      _sphinxDefineContract(
        _defineOptions.referenceName,
        addr,
        "${fullyQualifiedName}",
        "${clientArtifactPath}"
      )
    );
  }

  function deploy${contractName}(${
    inputs !== '' ? `\n    ${inputs}\n  ` : ''
  }) internal returns (${uniqueClientName}) {
    return deploy${contractName}(
      ${
        inputNames !== '' ? `${inputNames},\n      ` : ''
      }DeployOptions({ salt: bytes32(0), referenceName: "${contractName}" })
    );
  }

  function deploy${contractName}(${
    inputs !== '' ? `\n    ${inputs},\n    ` : ''
  }DeployOptions memory _sphinxInternalDeployOptions
  ) internal returns (${uniqueClientName}) {
    bytes memory sphinxInternalConstructorArgs = abi.encode(
      ${inputNames}
    );
    return ${uniqueClientName}(
      _sphinxDeployContract(
        _sphinxInternalDeployOptions.referenceName,
        _sphinxInternalDeployOptions.salt,
        sphinxInternalConstructorArgs,
        "${fullyQualifiedName}",
        "${clientArtifactPath}",
        "${artifactPath}"
      )
    );
  }`

  return { imports, functionDefinitions }
}

export const generateFunctionFromASTDefinition = (
  definition: FunctionDefinition,
  sourceUnit: SourceUnit,
  sourceFilePath: string,
  fileDepth: number,
  remappings: Record<string, string>,
  src: string,
  fullyQualifiedName: string
) => {
  // Construct the function header
  const isPure = definition.stateMutability === 'pure'
  const isView = definition.stateMutability === 'view'
  const inputs = formatParameters(
    definition.parameters.parameters,
    true,
    true,
    !isPure
  )
  const outputs = formatParameters(
    definition.returnParameters.parameters,
    true,
    true,
    false
  )

  const importSources = [
    ...definition.parameters.parameters,
    ...(isPure ? definition.returnParameters.parameters : []),
  ]

  const { newImports: imports } = generateImportsFromVariableDeclarations(
    importSources,
    sourceUnit,
    sourceFilePath,
    fileDepth,
    remappings,
    {},
    src
  )

  // We only return data for pure functions
  const outputsString =
    isPure && outputs.length > 0 ? ` returns (${outputs})` : ''
  const functionHeader = `function ${definition.name}(${inputs}) external delegateIfNotManager${outputsString}`

  if (isPure) {
    // Generate pure functions
    const functionDefinition = `
  ${functionHeader} {
    _delegate(sphinxInternalImpl);
  }
`
    return { imports, functionDefinition }
  } else if (isView) {
    // We do not support view functions at this time
    return { imports: {}, functionDefinition: '' }
  } else {
    // Generate mutable functions
    const inputNames = formatParameters(
      definition.parameters.parameters,
      false,
      false,
      true
    )

    const functionDefinition = `
  ${functionHeader} {
    bytes4 sphinxInternalSelector = 0x${definition.functionSelector};
    bytes memory sphinxInternalFunctionArgs = abi.encode(${inputNames});
    _callFunction(sphinxInternalSelector, sphinxInternalFunctionArgs, "${fullyQualifiedName}");
  }
`

    return { imports, functionDefinition }
  }
}
