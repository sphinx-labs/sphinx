// Import 'chai-as-promised'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

chai.use(chaiAsPromised)
const expect = chai.expect

import {
  messageArtifactNotFound,
  getContractArtifact,
  messageMultipleArtifactsFound,
} from '../../src/foundry/utils'
import { getFoundryConfigOptions } from '../../src/foundry/options'

// TODO: make sure that your new test files run automatically when you `yarn test`

describe('Utils', async () => {
  describe('getContractArtifact', async () => {
    // These contract paths actually exist in the artifacts folder that's generated when building
    // the plugins package, and this is how the cachedContractNames object is actually represented
    // for these contracts.
    const cachedContractNames = {
      MyContract1: ['contracts/test/MyContracts.sol'],
      MyContract2: ['contracts/test/MyContracts.sol'],
      Sphinx: ['contracts/foundry/Sphinx.sol'],
      SphinxScript: ['script/BridgeFunds.s.sol', 'script/Sphinx.s.sol'],
    }

    it('Errors if artifact is not found', async () => {
      const { artifactFolder } = await getFoundryConfigOptions()

      const contractName = 'NonExistentContract'
      await expect(
        getContractArtifact(contractName, artifactFolder, cachedContractNames)
      ).to.be.rejectedWith(messageArtifactNotFound(contractName))
    })

    it('Errors if multiple artifacts are found for contract name', async () => {
      const { artifactFolder } = await getFoundryConfigOptions()

      // This contract name is ambiguous because it's defined in two different files. We'd need to
      // use the fully qualified name to get the artifact for this contract.
      const contractName = 'SphinxScript'
      await expect(
        getContractArtifact(contractName, artifactFolder, cachedContractNames)
      ).to.be.rejectedWith(messageMultipleArtifactsFound(contractName))
    })

    it('Gets the artifact for a contract defined in a file with the same name', async () => {
      const { artifactFolder } = await getFoundryConfigOptions()

      const contractName = 'Sphinx'
      const artifact = await getContractArtifact(
        contractName,
        artifactFolder,
        cachedContractNames
      )
      expect(artifact.contractName).equals('Sphinx')
    })

    it('Gets the artifact for a fully qualified name', async () => {
      const { artifactFolder } = await getFoundryConfigOptions()

      const fullyQualifiedName = 'script/BridgeFunds.s.sol:SphinxScript'
      const artifact = await getContractArtifact(
        fullyQualifiedName,
        artifactFolder,
        cachedContractNames
      )
      expect(artifact.contractName).equals('SphinxScript')
    })
  })
})
