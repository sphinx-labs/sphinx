import { DeploymentArtifacts } from '@sphinx-labs/core'

import * as artifacts from '../centrifuge-artifacts.json'

const deploymentArtifacts: DeploymentArtifacts = artifacts as any

for (const executionArtifact of Object.values(
  deploymentArtifacts.networks['11155111'].executionArtifacts
)) {
  const usedHashes = new Set<string>()
  let sum = 0
  for (const e of executionArtifact.transactions) {
    if (!usedHashes.has(e.receipt.hash)) {
      sum += Number(e.receipt.gasUsed)
      usedHashes.add(e.receipt.hash)
    }
  }
  console.log('num receipts: ', usedHashes.size)
  console.log(sum)
}
