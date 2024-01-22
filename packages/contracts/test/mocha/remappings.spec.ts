import { spawnSync } from 'child_process'
import { existsSync } from 'fs'

import { expect } from 'chai'

import { RECOMMENDED_REMAPPING } from '../../src/constants'

/**
 * This tests that we have no remapping defined for forge-std. We do this because users install our library in their repo and then import
 * our contracts in their scripts. So any remapping used in contracts that will be imported by the user would also need to be defined
 * by them. We chose not to use a remapping for forge-std at all, and we enforce that with the test below.
 *
 * In the future if we add additional libraries which are imported by our production contracts, we should add additional tests here
 * to enforce that they do not rely on remappings which may not be defined in the users project.
 */
describe('Remappings', () => {
  it('No remapping defined for forge-std', async () => {
    const { stdout } = await spawnSync('forge', ['config', '--json'])
    const { remappings, libs }: { remappings: string[]; libs: string[] } =
      JSON.parse(stdout.toString())

    // Expect the `libs` field to be an empty array
    // We check this because including the `lib` folder in the libs array will cause a remapping
    // for forge-std to be included automatically. Also if you leave the lib field out, then
    // a remapping for forge-std will be included automatically. So we need to set it to specifically
    // an empty array to get the behavior we would like:
    // No remappings defined for forge-std.
    expect(libs.length, 'libs should not be defined').to.eq(0)

    // Expect there to be no remapping for forge-std
    expect(
      remappings.some((remapping) => remapping.includes('lib/forge-std')),
      'remapping detected for forge-std'
    ).to.eq(false)

    // We expect there to be 4 remappings which are required by the core contracts and their tests.
    // See foundry.toml for those remappings.
    expect(remappings.length).to.eq(4)
  })

  /**
   * We test the init command in the demo package. Unfortunately, it is impratical to test that we can
   * install the sphinx contracts library and actually use the correct remappings in that test because
   * the version installed would not be the same version as is being tested (it would be the lasted
   * released version instead). So we disable installation of the library during the demo tests using
   * an environment variable.
   *
   * Luckily, the only meaningful thing that is not covered by the demo tests is that the recommended
   * remapping actually works. So we can simply add a test to check that directly.
   */
  it('Recommended remapping works', () => {
    const secondSection = RECOMMENDED_REMAPPING.split('=').at(1)

    expect(secondSection, 'invalid remapping').is.not.undefined

    expect(
      secondSection!.startsWith('lib/sphinx'),
      'does not start with lib/sphinx'
    ).to.be.true

    // Remove lib/sphinx and prepend remapping with ../../ to simulate being at the root of the project
    const remapping = `../..${secondSection!.replace('lib/sphinx', '')}`
    const filePath = `${remapping}/SphinxPlugin.sol`

    expect(
      existsSync(filePath),
      'SphinxPlugin.sol does not exist at resolved path'
    ).to.be.true
  })
})
