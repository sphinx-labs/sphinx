import { existsSync, rmSync } from 'fs'

export const deleteForgeProject = (
  contractPath: string,
  scriptPath: string,
  testPath: string
) => {
  // Delete the generated files
  if (existsSync(contractPath)) {
    rmSync(contractPath)
  }

  if (existsSync(testPath)) {
    rmSync(testPath)
  }

  if (existsSync(scriptPath)) {
    rmSync(scriptPath)
  }

  const deploymentArtifactDir = 'deployments'
  if (existsSync(deploymentArtifactDir)) {
    rmSync(deploymentArtifactDir, { recursive: true, force: true })
  }
}
