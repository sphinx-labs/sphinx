import hre from 'hardhat'
import { getBuildInfo } from '@chugsplash/plugins'
import { ContractDefinition } from 'solidity-ast'
import {
  isNodeType,
  findAll,
  astDereferencer,
  srcDecoder,
} from 'solidity-ast/utils'

const main = async () => {
  // TODO: Note: Already tested the stuff in the linear ticket. Just need to integrate this into the
  // codebase. You should refactor the other mention of linearizedBaseContract in the codebase

  const sourceName = 'contracts/HelloChugSplash.sol'
  const contractName = 'HelloChugSplash'

  const buildInfo = await getBuildInfo(hre, sourceName, contractName)
  const sourceUnit = buildInfo.output.sources[sourceName].ast
  const decodeSrc = srcDecoder(buildInfo.input, buildInfo.output)
  const dereferencer = astDereferencer(buildInfo.output)

  // Get the ContractDefinition node for this `contractName`. There should only be one
  // ContractDefinition since we filter by the `contractName`, which is unique within a SourceUnit.
  const childContractDefs = sourceUnit.nodes
    .filter(isNodeType('ContractDefinition'))
    .filter((contractDef: ContractDefinition) => {
      return contractDef.name === contractName
    })

  if (childContractDefs.length !== 1) {
    throw new Error(
      `Found ${childContractDefs.length} ContractDefinition nodes instead of 1 for ${contractName}. Should never happen.`
    )
  }

  const childContractDef = childContractDefs[0]

  // Get the base (i.e. parent) ContractDefinition nodes for the child contract.
  const baseContractDefs = childContractDef.linearizedBaseContracts.map(
    dereferencer('ContractDefinition')
  )

  // Iterate over the child ContractDefinition node and its parent ContractDefinition nodes.
  for (const contractDef of baseContractDefs.concat(childContractDef)) {
    for (const memberAccessNode of findAll('MemberAccess', contractDef)) {
      const typeIdentifier =
        memberAccessNode.expression.typeDescriptions.typeIdentifier
      const isDynamicBytesOrArray =
        typeof typeIdentifier === 'string' &&
        (typeIdentifier === 't_bytes_storage' ||
          typeIdentifier.endsWith('dyn_storage'))

      // Throw an error if calling `push()` with no parameters on a dynamic array or dynamic bytes.
      // We only throw an error when `push` is called with no parameters. In other words, we don't
      // throw an error for `push(x)`.
      if (
        isDynamicBytesOrArray &&
        memberAccessNode.memberName === 'push' &&
        memberAccessNode.argumentTypes &&
        memberAccessNode.argumentTypes.length === 0
      ) {
        throw new Error(
          `Detected the member function 'push()' at ${decodeSrc(
            memberAccessNode
          )}. Please use 'push(x)' instead.`
        )
      }
    }
  }
}

main()
