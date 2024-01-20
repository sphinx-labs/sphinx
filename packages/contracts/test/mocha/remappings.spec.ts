import { spawnSync } from 'child_process'

import { expect } from 'chai'

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
})
