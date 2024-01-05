export interface ProposeCommandArgs {
  scriptPath: string
  networks: 'testnets' | 'mainnets'
  confirm: boolean
  dryRun: boolean
  silent: boolean
  targetContract?: string
}

export interface DeployCommandArgs {
  network: string
  confirm: boolean
  silent: boolean
  scriptPath: string
  verify: boolean
  targetContract?: string
}
