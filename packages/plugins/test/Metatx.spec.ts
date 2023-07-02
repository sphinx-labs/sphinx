// Hardhat plugins
import '@nomiclabs/hardhat-ethers'

import hre from 'hardhat'
import { Contract } from 'ethers'
import {
  chugsplashClaimAbstractTask,
  chugsplashProposeAbstractTask,
  register,
  FORWARDER_ADDRESS,
  getChugSplashManager,
  getChugSplashRegistry,
  ProposalRoute,
  readValidatedChugSplashConfig,
} from '@chugsplash/core'
import { ForwarderArtifact } from '@chugsplash/contracts'
import { expect } from 'chai'
import ora from 'ora'

import { createChugSplashRuntime } from '../../plugins/src/cre'
import { makeGetConfigArtifacts } from '../src/hardhat/artifacts'

const configPath = './chugsplash/chugsplash.config.ts'
import { projectName } from '../chugsplash/projects/Metatx.config'

describe('Meta txs', () => {
  process.env['LOCAL_TEST_METATX_PROPOSE'] = 'true'

  let expectedDeploymentId: string
  let manager: Contract
  before(async () => {
    const provider = hre.ethers.provider
    const signer = hre.ethers.provider.getSigner()
    const signerAddress = await signer.getAddress()

    const cre = await createChugSplashRuntime(
      true,
      true,
      hre.config.paths.canonicalConfigs,
      hre,
      // if the config parsing fails and exits with code 1, you should flip this to false to see verbose output
      true
    )

    const { parsedConfig, configArtifacts, configCache } =
      await readValidatedChugSplashConfig(
        configPath,
        projectName,
        provider,
        cre,
        makeGetConfigArtifacts(hre)
      )

    // await chugsplashClaimAbstractTask(
    //   provider,
    //   signer,
    //   parsedConfig,
    //   false,
    //   signerAddress,
    //   'hardhat',
    //   cre
    // )

    // // Claim the project with the signer as the owner. Once we've completed the deployment, we'll
    // // transfer ownership to the user-defined new owner, if it exists.
    // const registry = await getChugSplashRegistry(signer)
    // const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
    // manager = getChugSplashManager(signer, parsedConfig.options.organizationID)

    // await register(
    //   registry,
    //   manager,
    //   parsedConfig.options.organizationID,
    //   signerAddress,
    //   false,
    //   provider,
    //   spinner
    // )

    const metatxs = await chugsplashProposeAbstractTask(
      provider,
      signer,
      parsedConfig.projects[projectName],
      configPath,
      '',
      'hardhat',
      configArtifacts,
      ProposalRoute.RELAY,
      cre,
      configCache[projectName]
    )

    const { request, signature, deploymentId } = metatxs!
    expectedDeploymentId = deploymentId

    const Forwarder = new Contract(
      FORWARDER_ADDRESS,
      ForwarderArtifact.abi,
      signer
    )

    // Validate request on the forwarder contract
    const valid = await Forwarder.verify(request, signature)
    if (!valid) {
      throw new Error(`Invalid metatxs request`)
    }

    // Send meta-tx through relayer to the forwarder contract
    const gasLimit = (request.gas + 50000).toString()
    await Forwarder.execute(request, signature, { gasLimit })
  })

  it('does propose with meta txs', async () => {
    const deployment = await manager.deployments(expectedDeploymentId)
    expect(deployment).to.exist
    expect(deployment.status).to.equal(1)
  })

  after(() => {
    process.env['LOCAL_TEST_METATX_PROPOSE'] = 'false'
  })
})
