import assert from 'assert'

import hre, { ethers } from 'hardhat'
import '../dist' // This loads in the ChugSplash's HRE type extensions, e.g. `canonicalConfigPath`
import '@nomiclabs/hardhat-ethers'
import {
  AUTH_FACTORY_ADDRESS,
  AuthState,
  AuthStatus,
  ParsedChugSplashConfig,
  UserChugSplashConfig,
  ensureChugSplashInitialized,
  getAuthAddress,
  getAuthData,
  getChugSplashManagerAddress,
  getChugSplashRegistry,
  makeAuthBundle,
  getParsedOrgConfig,
  AuthLeaf,
  AuthLeafType,
  ParsedConfigOptions,
  ParsedOrgConfigOptions,
  signAuthRootMetaTxn,
} from '@chugsplash/core'
import {
  AuthFactoryABI,
  AuthABI,
  PROPOSER_ROLE,
  PROJECT_MANAGER_ROLE,
} from '@chugsplash/contracts'
import { expect } from 'chai'
import { BigNumber, providers } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import { createChugSplashRuntime } from '../src/cre'
import { makeGetConfigArtifacts } from '../src/hardhat/artifacts'

// TODO: mv
const EMPTY_PARSED_CONFIG: ParsedChugSplashConfig = {
  options: {
    orgOwners: [],
    orgOwnerThreshold: 0,
    chainIds: [],
    proposers: [],
    managers: [],
  },
  projects: {},
}

// This is the `DEFAULT_ADMIN_ROLE` used by OpenZeppelin's Access Control contract, which the Auth
// contract inherits.
const ORG_OWNER_ROLE_HASH = ethers.constants.HashZero

const cre = createChugSplashRuntime(
  false,
  false,
  hre.config.paths.canonicalConfigs,
  hre,
  false
)

const orgOwnerThreshold = 1

describe('TODO', () => {
  let owner: providers.JsonRpcSigner
  let relayer: SignerWithAddress
  let ownerAddress: string
  before(async () => {
    owner = ethers.provider.getSigner()
    ownerAddress = await owner.getAddress()

    // The relayer is the signer that executes the transactions on the Auth contract
    relayer = (await hre.ethers.getSigners())[1]
  })

  it('TODO single owner', async () => {
    const orgOwners = [ownerAddress]
    const userConfig: UserChugSplashConfig = {
      options: {
        orgOwners,
        orgOwnerThreshold,
        networks: ['local'],
        proposers: [ownerAddress],
        managers: [ownerAddress],
      },
      projects: {},
    }

    const authData = getAuthData(orgOwners, orgOwnerThreshold)
    const authAddress = getAuthAddress(orgOwners, orgOwnerThreshold)
    const deployerAddress = getChugSplashManagerAddress(authAddress)

    await ensureChugSplashInitialized(ethers.provider, relayer)

    const { parsedConfig } = await getParsedOrgConfig(
      userConfig,
      [], // We don't pass in any projects since we're not using them in this test
      deployerAddress,
      ethers.provider,
      cre,
      makeGetConfigArtifacts(hre)
    )

    const Registry = getChugSplashRegistry(relayer)
    const AuthFactory = new ethers.Contract(
      AUTH_FACTORY_ADDRESS,
      AuthFactoryABI,
      relayer
    )

    // We set the `registryData` to `[]` since this version of the ChugSplashManager doesn't use it.
    await AuthFactory.deploy(authData, [], 0)

    // Check that the ChugSplashAuth and ChugSplashManager contracts were deployed at their expected
    // addresses
    // TODO: you can should probably remove these since we're doing integration tests. wait until later
    // to do this though
    assert(
      await AuthFactory.isDeployed(authAddress),
      'Auth address is not deployed'
    )
    assert(
      await Registry.isDeployed(deployerAddress),
      'ChugSplashManager address is not deployed'
    )

    const Auth = new ethers.Contract(authAddress, AuthABI, relayer)

    // Check that the Auth contract has been initialized correctly.
    expect(await Auth.orgOwnerThreshold()).deep.equals(
      BigNumber.from(orgOwnerThreshold)
    )
    expect(await Auth.getRoleMemberCount(ORG_OWNER_ROLE_HASH)).deep.equals(
      BigNumber.from(1)
    )
    expect(await Auth.hasRole(ORG_OWNER_ROLE_HASH, orgOwners[0])).equals(true)

    const EMPTY_CONFIG_INFO: ConfigInfo = {
      deployerAddress,
      chainStates: {},
    }
    const leafs = makeAuthLeafs(
      parsedConfig,
      EMPTY_PARSED_CONFIG,
      EMPTY_CONFIG_INFO
    )
    const { root, leafs: bundledLeafs } = makeAuthBundle(leafs)

    expect(bundledLeafs.length).equals(1)
    const { leaf, proof } = bundledLeafs[0]

    // Check that the state of the Auth contract is correct before calling the `setup` function.
    expect(await Auth.hasRole(PROPOSER_ROLE, ownerAddress)).equals(false)
    expect(await Auth.hasRole(PROJECT_MANAGER_ROLE, ownerAddress)).equals(false)
    // Check that the corresponding AuthState is empty.
    const initialAuthState: AuthState = await Auth.authStates(root)
    expect(initialAuthState.status).equals(AuthStatus.EMPTY)
    expect(initialAuthState.leafsExecuted).deep.equals(BigNumber.from(0))
    expect(initialAuthState.numLeafs).deep.equals(BigNumber.from(0))

    const signature = await signAuthRootMetaTxn(owner, root)

    // TODO: is it bad that proof is an empty array?

    await Auth.setup(root, leaf, [signature], proof)

    // Check that the owner has been given the appropriate roles.
    expect(await Auth.hasRole(PROPOSER_ROLE, ownerAddress)).equals(true)
    expect(await Auth.hasRole(PROJECT_MANAGER_ROLE, ownerAddress)).equals(true)
    // Check that the AuthState has been marked as completed.
    const authState: AuthState = await Auth.authStates(root)
    expect(authState.status).equals(AuthStatus.COMPLETED)
    expect(authState.leafsExecuted).deep.equals(BigNumber.from(1))
    expect(authState.numLeafs).deep.equals(BigNumber.from(1))
  })
})

// TODO: mv
type ConfigInfo = {
  deployerAddress: string
  chainStates: {
    [chainId: number]: {
      firstProposalOccurred: boolean
    }
  }
}

// TODO: mv
// TODO(docs): `chainStates` must contain all of the chainIds that are in `prevConfig`.
// TODO: validate that `chainStates` contains all of the networks that are in `prevConfig`. perhaps
// do this in the parsing/validation, or in our back-end
const makeAuthLeafs = (
  config: ParsedChugSplashConfig,
  prevConfig: ParsedChugSplashConfig,
  prevConfigInfo: ConfigInfo
): Array<AuthLeaf> => {
  let leafs: Array<AuthLeaf> = []

  const { options } = config
  const { options: prevOptions } = prevConfig

  if (
    !isParsedOrgConfigOptions(options) ||
    !isParsedOrgConfigOptions(prevOptions)
  ) {
    throw new Error(`TODO: should never happen`)
  }

  const { deployerAddress, chainStates: prevChainStates } = prevConfigInfo
  const { proposers, managers, chainIds } = options
  const {
    proposers: prevProposers,
    managers: prevManagers,
    chainIds: prevChainIds,
  } = prevOptions

  const chainsToAdd = chainIds.filter((c) => !prevChainIds.includes(c))
  const chainsToKeep = chainIds.filter((c) => prevChainIds.includes(c))

  if (chainsToAdd.length > 0) {
    const TODOprevConfig: ParsedChugSplashConfig = {
      options: {
        chainIds: chainsToAdd, // TODO(docs)
        orgOwners: [],
        orgOwnerThreshold: 0,
        proposers: [],
        managers: [],
      },
      projects: {},
    }

    const TODOprevConfigInfo: ConfigInfo = {
      deployerAddress,
      chainStates: {},
    }
    chainIds.forEach((chainId) => {
      TODOprevConfigInfo.chainStates[chainId] = {
        firstProposalOccurred: false,
      }
    })

    const newChainLeafs = makeAuthLeafs(
      config,
      TODOprevConfig,
      TODOprevConfigInfo
    )
    leafs = leafs.concat(newChainLeafs)
  }

  for (const chainId of chainsToKeep) {
    let index = 0
    const { firstProposalOccurred } = prevChainStates[chainId]
    // for (const [chainIdStr, state] of Object.entries(prevChainState)) {
    // TODO(docs)

    if (firstProposalOccurred) {
      // TODO
    } else {
      const proposersToAdd = proposers.filter((p) => !prevProposers.includes(p))
      const proposersToRemove = prevProposers.filter(
        (p) => !proposers.includes(p)
      )
      const proposersToSet = proposersToAdd
        .map((p) => {
          return { member: p, add: true }
        })
        .concat(
          proposersToRemove.map((p) => {
            return { member: p, add: false }
          })
        )

      const managersToAdd = managers.filter((m) => !prevManagers.includes(m))
      const managersToRemove = prevManagers.filter((m) => !managers.includes(m))
      const managersToSet = managersToAdd
        .map((m) => {
          return { member: m, add: true }
        })
        .concat(
          managersToRemove.map((m) => {
            return { member: m, add: false }
          })
        )

      const setupLeaf: AuthLeaf = {
        leafType: AuthLeafType.SETUP,
        proposers: proposersToSet,
        managers: managersToSet,
        chainId,
        to: deployerAddress,
        index,
      }
      index += 1
      leafs.push(setupLeaf)
    }
  }

  return leafs
}

// TODO: mv
const isParsedOrgConfigOptions = (
  options: ParsedConfigOptions
): options is ParsedOrgConfigOptions => {
  return (
    options.orgOwners !== undefined &&
    options.orgOwnerThreshold !== undefined &&
    options.proposers !== undefined &&
    options.managers !== undefined &&
    options.chainIds !== undefined
  )
}
