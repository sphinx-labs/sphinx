import chai from 'chai'

// - TODO(ask): hai: what does the `yarn script:goerli:delegate` command do?

// - TODO(md): add pnpm option in installation guide(s) since mean finance uses this

import {
  buildInfo as sphinxContractsBuildInfo,
} from '@sphinx-labs/contracts'
import { getFoundryConfigOptions } from '../../../src/foundry/options'
import { getStorageLayout, getStorageSlotKey } from '@sphinx-labs/core'
import { makeGetConfigArtifacts } from '../../../src/foundry/utils'

const expect = chai.expect

describe('LocalSphinxManager', () => {
  it(`LocalSphinxManager 'callNonces' mapping matches SphinxManager in storage layout`, async () => {
    const fullyQualifiedName = 'contracts/SphinxManager.sol:SphinxManager'
    const [sourceName, contractName] = fullyQualifiedName.split(':')
    const storageLayout = getStorageLayout(
      sphinxContractsBuildInfo.output,
      sourceName,
      contractName
    )
    const managerSlotKey = getStorageSlotKey(
      'contracts/SphinxManager.sol:SphinxManager',
      storageLayout,
      'callNonces'
    )

    const { artifactFolder, buildInfoFolder, cachePath } = await getFoundryConfigOptions()

    const getConfigArtifacts = makeGetConfigArtifacts(
      artifactFolder,
      buildInfoFolder,
      cachePath
    )

    const localManagerFullyQualifiedName = 'contracts/foundry/LocalSphinxManager.sol:LocalSphinxManager'
    const configArtifacts = await getConfigArtifacts([localManagerFullyQualifiedName])

    const localManagerSlotKey = getStorageSlotKey(
      localManagerFullyQualifiedName,
      configArtifacts[localManagerFullyQualifiedName].artifact.storageLayout ?? { storage: [], types: {} },
      'callNonces'
    )

    expect(localManagerSlotKey).to.equal(managerSlotKey)
  })
})
