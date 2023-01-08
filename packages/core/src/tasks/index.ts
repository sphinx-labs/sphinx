import { stdout } from 'process'

import { ethers } from 'ethers'
import ora from 'ora'

import { ParsedChugSplashConfig } from '../config'
import { registerChugSplashProject } from '../utils'

export const chugsplashRegisterAbstractTask = async (
  configs: ParsedChugSplashConfig[],
  owner: string,
  silent: boolean,
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer
) => {
  const spinner = ora({ isSilent: silent, stream: stdout })

  for (const parsedConfig of configs) {
    spinner.start(`Registering ${parsedConfig.options.projectName}...`)

    const isFirstTimeRegistered = await registerChugSplashProject(
      provider,
      signer,
      await signer.getAddress(),
      parsedConfig.options.projectName,
      owner
    )

    isFirstTimeRegistered
      ? spinner.succeed(
          `Project successfully registered on ${provider.network.name}. Owner: ${owner}`
        )
      : spinner.fail(
          `Project was already registered by the caller on ${provider.network.name}.`
        )
  }
}
