import { execSync } from 'child_process'
import { existsSync, readFileSync, unlinkSync } from 'fs'

import { expect } from 'chai'

type ReleaseType = 'major' | 'minor' | 'patch'

type Release = {
  name:
    | '@sphinx-labs/plugins'
    | '@sphinx-labs/core'
    | '@sphinx-labs/contracts'
    | '@sphinx-labs/demo'
  type: ReleaseType
  oldVersion: string
  changesets: Array<string>
  newVersion: string
}

const mapReleaseTypeToIndex = (type: ReleaseType) => {
  switch (type) {
    case 'major':
      return 3
    case 'minor':
      return 2
    case 'patch':
      return 1
    default:
      throw new Error('Invalid release type')
  }
}

type Changesets = {
  releases: Array<Release>
}

/**
 * We use the Changesets package to generate release versions which requires that we manaully determine when to do
 * releases and for which packages. There are some cases where we can accidentally do a release incorrectly that could
 * result in user either not getting changes that they should get based on the plugins package version they have
 * installed, or that in the worst case could break their installation.
 *
 * We use this test suite to enforce some basic rules that prevent this from happening:
 * 1. If we make a release for core or contracts, we must also make a release for plugins. This ensures we never release
 * a change to core or contracts that won't automatically be reflected in the latest version of the plugins package.
 *
 * 2. The release type severity should always follow the order: contracts >= core >= plugins. This means that if we are
 * going to do a minor release for plugins, we have to also do a minor release for core, if there are any changes in core.
 *
 * This prevents the following case:
 * We ship a patch change to core that is a breaking change in plugins (i.e changes an interface that plugins relies on),
 * then ship a minor change for the plugins package. This would break the plugins package for people who are installing
 * a previous version without a lock file. This would happen b/c they would get the latest patch change in core, but would
 * not have the latest minor change to plugins. So the update to core would be incompatible with the update to plugins.
 */
describe('Changesets', () => {
  const changesetOutputFile = './changesets.json'
  let changesets: Changesets

  before(function () {
    // We skip these tests for normal PRs since it's easier to just resolve any issues related to this when we do a release
    // If we enforce this on a per PR basis, we'll probably also end up with a bunch of release notes for different packages
    // that don't really make sense.
    const CIRCLE_BRANCH = process.env.CIRCLE_BRANCH
    if (typeof CIRCLE_BRANCH === 'string' && CIRCLE_BRANCH !== 'develop') {
      console.log('Skipping tests since this is not the develop branch')
      this.skip()
    }

    execSync(
      `yarn changeset status --since main --output=${changesetOutputFile}`
    )
    changesets = JSON.parse(readFileSync(changesetOutputFile).toString())
  })

  after(async () => {
    if (existsSync(`${changesetOutputFile}`)) {
      unlinkSync(`${changesetOutputFile}`)
    }
  })

  it('If core or contracts bumped, then plugins also bumped', async () => {
    const contractsRelease = changesets.releases.find(
      (release) => release.name === '@sphinx-labs/contracts'
    )
    const coreRelease = changesets.releases.find(
      (release) => release.name === '@sphinx-labs/core'
    )
    const pluginsRelease = changesets.releases.find(
      (release) => release.name === '@sphinx-labs/plugins'
    )

    if (contractsRelease || coreRelease) {
      expect(pluginsRelease).is.not.undefined
    }
  })

  it('contracts release type >= core', async () => {
    const contractsRelease = changesets.releases.find(
      (release) => release.name === '@sphinx-labs/contracts'
    )
    const coreRelease = changesets.releases.find(
      (release) => release.name === '@sphinx-labs/core'
    )

    if (contractsRelease && coreRelease) {
      expect(
        mapReleaseTypeToIndex(contractsRelease.type)
      ).to.be.greaterThanOrEqual(mapReleaseTypeToIndex(coreRelease.type))
    }
  })

  it('core release type >= plugins', async () => {
    const coreRelease = changesets.releases.find(
      (release) => release.name === '@sphinx-labs/core'
    )
    const pluginsRelease = changesets.releases.find(
      (release) => release.name === '@sphinx-labs/plugins'
    )

    if (coreRelease && pluginsRelease) {
      expect(mapReleaseTypeToIndex(coreRelease.type)).to.be.greaterThanOrEqual(
        mapReleaseTypeToIndex(pluginsRelease.type)
      )
    }
  })

  it('contract release type >= plugins', async () => {
    const contractsRelease = changesets.releases.find(
      (release) => release.name === '@sphinx-labs/contracts'
    )
    const pluginsRelease = changesets.releases.find(
      (release) => release.name === '@sphinx-labs/plugins'
    )

    if (contractsRelease && pluginsRelease) {
      expect(
        mapReleaseTypeToIndex(contractsRelease.type)
      ).to.be.greaterThanOrEqual(mapReleaseTypeToIndex(pluginsRelease.type))
    }
  })
})
