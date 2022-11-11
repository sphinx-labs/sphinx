import * as dotenv from 'dotenv'
import {
  CanonicalChugSplashConfig,
  ChugSplashActionBundle,
} from '@chugsplash/core'
import {
  TASK_CHUGSPLASH_FETCH,
  TASK_CHUGSPLASH_BUNDLE_REMOTE,
} from '@chugsplash/plugins'

// Load environment variables from .env
dotenv.config()

/**
 * Compiles a remote ChugSplashBundle from a uri.
 *
 * @param configUri URI of the ChugSplashBundle to compile.
 * @param provider JSON RPC provider.
 * @returns Compiled ChugSplashBundle.
 */
export const compileRemoteBundle = async (
  hre: any,
  configUri: string
): Promise<{
  bundle: ChugSplashActionBundle
  canonicalConfig: CanonicalChugSplashConfig
}> => {
  const canonicalConfig = await hre.run(TASK_CHUGSPLASH_FETCH, {
    configUri,
  })
  const bundle = await hre.run(TASK_CHUGSPLASH_BUNDLE_REMOTE, {
    canonicalConfig,
  })
  return { bundle, canonicalConfig }
}
