import * as path from 'path'
import * as fs from 'fs'

/* eslint-disable @typescript-eslint/no-var-requires */
export const ChugSplashRegistryArtifact = require('../artifacts/contracts/ChugSplashRegistry.sol/ChugSplashRegistry.json')
export const ChugSplashBootLoaderArtifact = require('../artifacts/contracts/ChugSplashBootLoader.sol/ChugSplashBootLoader.json')
export const ChugSplashManagerProxyArtifact = require('../artifacts/contracts/ChugSplashManagerProxy.sol/ChugSplashManagerProxy.json')
export const ChugSplashManagerArtifact = require('../artifacts/contracts/ChugSplashManager.sol/ChugSplashManager.json')
export const ProxyUpdaterArtifact = require('../artifacts/contracts/ProxyUpdater.sol/ProxyUpdater.json')
export const DefaultAdapterArtifact = require('../artifacts/contracts/adapters/DefaultAdapter.sol/DefaultAdapter.json')
export const ProxyArtifact = require('../artifacts/contracts/libraries/Proxy.sol/Proxy.json')

const buildInfoFolderPath = path.join(
  '..',
  'contracts',
  'artifacts',
  'build-info'
)
const buildInfoFilePath = fs
  .readdirSync(buildInfoFolderPath)
  .map((file) => path.join(buildInfoFolderPath, file))[0]
export const buildInfo = JSON.parse(fs.readFileSync(buildInfoFilePath, 'utf8'))

export const ChugSplashRegistryABI = ChugSplashRegistryArtifact.abi
export const ChugSplashBootLoaderABI = ChugSplashBootLoaderArtifact.abi
export const ChugSplashManagerProxyABI = ChugSplashManagerProxyArtifact.abi
export const ChugSplashManagerABI = ChugSplashManagerArtifact.abi
export const ProxyUpdaterABI = ProxyUpdaterArtifact.abi
export const DefaultAdapterABI = DefaultAdapterArtifact.abi
export const ProxyABI = ProxyArtifact.abi
