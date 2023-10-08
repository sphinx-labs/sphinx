import { CompilerConfig } from '@sphinx-labs/core'
import {
  BundledAuthLeaf,
  HumanReadableAction,
  SphinxActionBundle,
  SphinxTargetBundle,
} from '@sphinx-labs/core/dist/actions/types'

export type BundleInfo = {
  networkName: string
  configUri: string
  authLeafs: Array<BundledAuthLeaf>
  actionBundle: SphinxActionBundle
  targetBundle: SphinxTargetBundle
  humanReadableActions: Array<HumanReadableAction>
  compilerConfig: CompilerConfig
}

export type ProposalOutput = {
  proposerAddress: string
  metaTxnSignature: string
  bundleInfoArray: Array<BundleInfo>
  authRoot: string
}
