import * as dotenv from 'dotenv'
import {
  CanonicalChugSplashConfig,
  ChugSplashActionBundle,
} from '@chugsplash/core'
import {
  bundleRemoteSubtask,
  chugsplashFetchSubtask,
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
  configUri: string
): Promise<{
  bundle: ChugSplashActionBundle
  canonicalConfig: CanonicalChugSplashConfig
}> => {
  const canonicalConfig = await chugsplashFetchSubtask({ configUri })
  const bundle = await bundleRemoteSubtask({ canonicalConfig })
  return { bundle, canonicalConfig }
}
