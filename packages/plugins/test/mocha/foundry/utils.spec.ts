import { resolve } from 'path'
import { existsSync } from 'fs'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

chai.use(chaiAsPromised)
const expect = chai.expect

import {
  messageArtifactNotFound,
  readFoundryContractArtifact,
} from '../../../src/foundry/utils'
import { getFoundryToml } from '../../../src/foundry/options'

describe('Utils', async () => {
  describe('readFoundryContractArtifact', async () => {
    const projectRoot = process.cwd()

    let artifactFolder: string

    before(async () => {
      const foundryToml = await getFoundryToml()
      artifactFolder = foundryToml.artifactFolder
    })

    it('Errors if artifact is not found', async () => {
      const fullyQualifiedName =
        'contracts/DoesNotExist.sol:NonExistentContract'
      await expect(
        readFoundryContractArtifact(
          fullyQualifiedName,
          projectRoot,
          artifactFolder
        )
      ).to.be.rejectedWith(messageArtifactNotFound(fullyQualifiedName))
    })

    it('Gets the artifact for a fully qualified name', async () => {
      const fullyQualifiedName = 'script/BridgeFunds.s.sol:SphinxScript'
      const artifact = await readFoundryContractArtifact(
        fullyQualifiedName,
        projectRoot,
        artifactFolder
      )
      expect(artifact.contractName).equals('SphinxScript')
    })

    // Tests scenarios where there are multiple contracts with the same name but located in
    // different directories or with different source file names.
    it('Gets artifacts for contracts with the same name', async () => {
      // The source name and contract name of this contract match.
      const contractOne =
        'contracts/test/DuplicateContractName.sol:DuplicateContractName'
      // The source name and contract name of this contract don't match.
      const contractTwo = 'contracts/test/MyContracts.sol:DuplicateContractName'
      // This contract's source file is nested one level. We use the absolute path because it's
      // possible that the artifact path is an absolute path in production. This isn't strictly
      // necessary to test, but it adds variety to this test case.
      const absolutePath = resolve(
        'contracts/test/deep/DuplicateContractName.sol'
      )
      const contractThree = `${absolutePath}:DuplicateContractName`
      // This contract's source file is nested two levels.
      const contractFour =
        'contracts/test/deep/deeper/DuplicateContractName.sol:DuplicateContractName'
      // This contract is nested only one level, but it shares a parent source directory with the
      // previous contract. (They both exist in a `deeper` directory).
      const contractFive =
        'contracts/test/deeper/DuplicateContractName.sol:DuplicateContractName'

      const artifactOne = await readFoundryContractArtifact(
        contractOne,
        projectRoot,
        artifactFolder
      )
      const artifactTwo = await readFoundryContractArtifact(
        contractTwo,
        projectRoot,
        artifactFolder
      )
      const artifactThree = await readFoundryContractArtifact(
        contractThree,
        projectRoot,
        artifactFolder
      )
      const artifactFour = await readFoundryContractArtifact(
        contractFour,
        projectRoot,
        artifactFolder
      )
      const artifactFive = await readFoundryContractArtifact(
        contractFive,
        projectRoot,
        artifactFolder
      )

      // Check that the location of the artifact files is correct.
      // First contract:
      expect(
        existsSync(
          `${artifactFolder}/DuplicateContractName.sol/DuplicateContractName.json`
        )
      ).equals(true)
      // Second contract:
      expect(
        existsSync(
          `${artifactFolder}/MyContracts.sol/DuplicateContractName.json`
        )
      ).equals(true)
      // Third contract:
      expect(
        existsSync(
          `${artifactFolder}/deep/DuplicateContractName.sol/DuplicateContractName.json`
        )
      ).equals(true)
      // Fourth contract:
      expect(
        existsSync(
          `${artifactFolder}/deeper/DuplicateContractName.sol/DuplicateContractName.json`
        )
      ).equals(true)
      // Fifth contract:
      expect(
        existsSync(
          `${artifactFolder}/test/deeper/DuplicateContractName.sol/DuplicateContractName.json`
        )
      ).equals(true)

      // Check that we retrieved the correct artifacts.
      expect(
        artifactOne.abi.some((e) => e.name === 'duplicateContractOne')
      ).equals(true)
      expect(
        artifactTwo.abi.some((e) => e.name === 'duplicateContractTwo')
      ).equals(true)
      expect(
        artifactThree.abi.some((e) => e.name === 'duplicateContractThree')
      ).equals(true)
      expect(
        artifactFour.abi.some((e) => e.name === 'duplicateContractFour')
      ).equals(true)
      expect(
        artifactFive.abi.some((e) => e.name === 'duplicateContractFive')
      ).equals(true)
    })
  })
})
