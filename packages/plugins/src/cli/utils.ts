import semver from 'semver'

export const NoNetworkArgsError = `Expected at least one network, but none were supplied.`

export const BothNetworksSpecifiedError = `You must specify either 'testnets' or 'mainnets', but not both.`

export const ConfirmAndDryRunError =
  '--confirm and --dry-run cannot be used together'

export const getDuplicatedNetworkErrorMessage = (duplicated: Array<string>) =>
  `User entered the following networks more than once:\n` +
  duplicated.map((n) => `- ${n}`).join(`\n`)

export const assertValidNodeVersion = () => {
  const requiredVersion = '16.16.0'
  const currentVersion = process.version

  // Compares if the current version is >= requiredVersion
  if (!semver.gte(currentVersion, requiredVersion)) {
    throw new Error(
      `Current Node.js version ${currentVersion} is not sufficient. Sphinx requires >=${requiredVersion}`
    )
  }
}
