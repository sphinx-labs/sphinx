import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

chai.use(chaiAsPromised)
const expect = chai.expect

import {
  messageArtifactNotFound,
  getContractArtifact,
} from '../../../src/foundry/utils'
import { getFoundryConfigOptions } from '../../../src/foundry/options'

// TODO(test): make sure that you don't skip any tests in `yarn test`. checked the contracts, core,
// and demo packages. checked plugins `yarn test:ts`

describe('Utils', async () => {
  describe('getContractArtifact', async () => {
    it('Errors if artifact is not found', async () => {
      const { artifactFolder } = await getFoundryConfigOptions()

      const fullyQualifiedName = 'contracts/DoesNotExist.sol:NonExistentContract'
      await expect(
        getContractArtifact(fullyQualifiedName, artifactFolder)
      ).to.be.rejectedWith(messageArtifactNotFound(fullyQualifiedName))
    })

    it('Gets the artifact for a fully qualified name', async () => {
      const { artifactFolder } = await getFoundryConfigOptions()

      const fullyQualifiedName = 'script/BridgeFunds.s.sol:SphinxScript'
      const artifact = await getContractArtifact(
        fullyQualifiedName,
        artifactFolder,
      )
      expect(artifact.contractName).equals('SphinxScript')
    })
  })
})
