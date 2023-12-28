import { ConfigArtifacts } from '@sphinx-labs/core'

// The type is incorrect by design, only the fully qualified name is required when overriding the config artifacts
// as long as the test does not rely on the deployment artifacts being output.
// If testing the deployment artifacts, then we should use the standard config artifact fetching process.
export const fetchMockConfigArtifacts = (
  fullyQualifiedNames: string[]
): ConfigArtifacts => {
  const configArtifacts: ConfigArtifacts = {}
  for (const name of fullyQualifiedNames) {
    configArtifacts[name] = {
      buildInfo: {},
      artifact: {},
    } as any
  }

  return configArtifacts
}
