import { remove0x } from '@eth-optimism/core-utils'
import { utils } from 'ethers'

import { ParsedChugSplashConfig } from '../config'

export const getCreationCode = (
  bytecode: string,
  parsedConfig: ParsedChugSplashConfig,
  referenceName: string,
  abi: any,
  compilerOutput: any,
  sourceName: string,
  contractName: string
): string => {
  const { constructorArgTypes, constructorArgValues } = getConstructorArgs(
    parsedConfig,
    referenceName,
    abi,
    compilerOutput,
    sourceName,
    contractName
  )

  const creationCodeWithConstructorArgs = bytecode.concat(
    remove0x(
      utils.defaultAbiCoder.encode(constructorArgTypes, constructorArgValues)
    )
  )

  return creationCodeWithConstructorArgs
}

export const getConstructorArgs = (
  parsedConfig: ParsedChugSplashConfig,
  referenceName: string,
  abi: any,
  compilerOutput: any,
  sourceName: string,
  contractName: string
): { constructorArgTypes: any[]; constructorArgValues: any[] } => {
  const immutableReferences =
    compilerOutput.contracts[sourceName][contractName].evm.deployedBytecode
      .immutableReferences

  const contractConfig = parsedConfig.contracts[referenceName]

  const constructorFragment = abi.find(
    (fragment) => fragment.type === 'constructor'
  )
  const constructorArgTypes = []
  const constructorArgValues = []
  if (constructorFragment === undefined) {
    return { constructorArgTypes, constructorArgValues }
  }

  // Maps a constructor argument name to the corresponding variable name in the ChugSplash config
  const constructorArgNamesToImmutableNames = {}

  for (const source of Object.values(compilerOutput.sources)) {
    for (const contractNode of (source as any).ast.nodes) {
      if (
        contractNode.nodeType === 'ContractDefinition' &&
        contractNode.nodes !== undefined
      ) {
        for (const node of contractNode.nodes) {
          if (
            node.nodeType === 'VariableDeclaration' &&
            node.mutability === 'immutable' &&
            Object.keys(immutableReferences).includes(node.id.toString(10))
          ) {
            if (contractConfig.variables[node.name] === undefined) {
              throw new Error(
                `Could not find immutable variable "${node.name}" in ${referenceName}.
Did you forget to declare it in ${parsedConfig.options.projectName}?`
              )
            }

            const constructorArgName =
              getConstructorArgNameForImmutableVariable(
                contractConfig.contract,
                contractNode.nodes,
                node.name
              )
            constructorArgNamesToImmutableNames[constructorArgName] = node.name
          }
        }
      }
    }
  }

  constructorFragment.inputs.forEach((input) => {
    constructorArgTypes.push(input.type)
    if (constructorArgNamesToImmutableNames.hasOwnProperty(input.name)) {
      constructorArgValues.push(
        contractConfig.variables[
          constructorArgNamesToImmutableNames[input.name]
        ]
      )
    } else {
      throw new Error(
        `Detected a non-immutable constructor argument, "${input.name}", in ${contractConfig.contract}.
Please remove it or make the corresponding variable immutable.`
      )
    }
  })

  return { constructorArgTypes, constructorArgValues }
}

export const getNestedConstructorArg = (variableName: string, args): string => {
  let remainingArguments = args[0]
  while (remainingArguments !== undefined) {
    if (remainingArguments.name !== undefined) {
      return remainingArguments.name
    }
    remainingArguments = remainingArguments.arguments[0]
  }
  throw new Error(
    `Could not find nested constructor argument for the immutable variable ${variableName}.
Please report this error.`
  )
}

export const getConstructorArgNameForImmutableVariable = (
  contractName: string,
  nodes: any,
  variableName: string
): string => {
  for (const node of nodes) {
    if (node.kind === 'constructor') {
      for (const statement of node.body.statements) {
        if (statement.expression.nodeType === 'FunctionCall') {
          throw new Error(
            `Please remove the "${statement.expression.expression.name}" call in the constructor for ${contractName}.`
          )
        } else if (statement.expression.nodeType !== 'Assignment') {
          throw new Error(
            `disallowed statement in constructor for ${contractName}: ${statement.expression.nodeType}`
          )
        }
        if (statement.expression.leftHandSide.name === variableName) {
          if (typeof statement.expression.rightHandSide.name === 'string') {
            return statement.expression.rightHandSide.name
          } else if (
            statement.expression.rightHandSide.kind === 'typeConversion'
          ) {
            return getNestedConstructorArg(
              variableName,
              statement.expression.rightHandSide.arguments
            )
          } else {
            throw new Error(
              `The immutable variable "${variableName}" must be assigned directly to a
constructor argument inside the body of the constructor in ${contractName}.`
            )
          }
        }
      }
    }
  }
  throw new Error(
    `Could not find immutable variable assignment for ${variableName}.
Did you forget to include it in your ChugSplash config file?`
  )
}

export const getImmutableVariables = (
  compilerOutput: any,
  sourceName: string,
  contractName: string
): string[] => {
  const immutableReferences: {
    [astId: number]: {
      length: number
      start: number
    }[]
  } =
    compilerOutput.contracts[sourceName][contractName].evm.deployedBytecode
      .immutableReferences

  if (
    immutableReferences === undefined ||
    Object.keys(immutableReferences).length === 0
  ) {
    return []
  }

  const immutableVariables: string[] = []
  for (const source of Object.values(compilerOutput.sources)) {
    for (const contractNode of (source as any).ast.nodes) {
      if (contractNode.nodeType === 'ContractDefinition') {
        for (const node of contractNode.nodes) {
          if (node.mutability === 'immutable') {
            immutableVariables.push(node.name)
          }
        }
      }
    }
  }
  return immutableVariables
}
