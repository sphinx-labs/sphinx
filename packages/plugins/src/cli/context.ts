import { GetConfigArtifacts, userConfirmation } from '@sphinx-labs/core'

import { makeGetConfigArtifacts } from '../foundry/utils'

export type SphinxContext = {
  makeGetConfigArtifacts: (
    artifactFolder: string,
    buildInfoFolder: string,
    projectRoot: string,
    cachePath: string
  ) => GetConfigArtifacts
  prompt: (question: string) => Promise<void>
}

export const makeSphinxContext = (): SphinxContext => {
  return {
    makeGetConfigArtifacts,
    prompt: userConfirmation,
  }
}
