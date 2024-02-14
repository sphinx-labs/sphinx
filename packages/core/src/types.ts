import { ProposalRequest } from './actions/types'

export type StoreDeploymentConfig = (
  apiKey: string,
  orgId: string,
  configData: string
) => Promise<string>

export type RelayProposal = (proposalRequest: ProposalRequest) => Promise<void>
