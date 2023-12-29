import { exec } from 'child_process'

import { SupportedChainId, execAsync, sleep } from '@sphinx-labs/core'

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
export const mockPrompt = async (q: string) => {}

export const getAnvilRpcUrl = (chainId: SupportedChainId): string => {
  return `http://127.0.0.1:${getAnvilPort(chainId)}`
}

const getAnvilPort = (chainId: SupportedChainId): number => {
  return 42000 + (chainId % 1000)
}

export const startAnvilNodes = async (chainIds: Array<SupportedChainId>) => {
  for (const chainId of chainIds) {
    // Start an Anvil node with a fresh state. We must use `exec` instead of `execAsync`
    // because the latter will hang indefinitely.
    exec(`anvil --chain-id ${chainId} --port ${getAnvilPort(chainId)} &`)
  }

  await sleep(1000)
}

export const killAnvilNodes = async (chainIds: Array<SupportedChainId>) => {
  for (const chainId of chainIds) {
    const port = getAnvilPort(chainId)

    // TODO: undo for-loop
    if (await isPortOpen(port)) {
      const { stdout } = await execAsync(`lsof -t -i:${port}`)
      const pids = stdout.trim().split('\n')

      for (const pid of pids) {
        if (pid) {
          await execAsync(`kill ${pid}`)
        }
      }
    }
  }
}

const isPortOpen = async (port: number): Promise<boolean> => {
  try {
    const { stdout } = await execAsync(`lsof -t -i:${port}`)
    return stdout.trim() !== ''
  } catch (error) {
    // If an error is thrown, it means the port is not in use
    return false
  }
}
