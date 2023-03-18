import * as Amplitude from '@amplitude/node'

import { Integration } from './constants'

// You can disable usage tracking with DISABLE_ANALYTICS=true
const amplitudeClient = Amplitude.init('acfe6e9a8c6c31ba8c644ffdc6da375d')
const disableAnalytics = process.env.DISABLE_ANALYTICS === 'true'

const timeout = (prom, time) => {
  let timer
  return Promise.race([
    prom,
    new Promise((_r, rej) => (timer = setTimeout(rej, time))),
  ]).finally(() => clearTimeout(timer))
}

export const trackExecuted = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration | undefined
) => {
  if (disableAnalytics) {
    return
  }
  await timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash executed',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackRegistered = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  await timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash register',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackProposed = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash propose',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackApproved = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash approve',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackDeployed = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash deploy',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackFund = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash fund',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackMonitor = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash monitor',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackCancel = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash cancel',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackWithdraw = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash withdraw',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackListProjects = async (
  user_id: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash list projects',
      user_id,
      event_properties: {
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackListProposers = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash list proposers',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackAddProposers = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash add proposer',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackClaimProxy = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash claim proxy',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackTransferProxy = async (
  user_id: string,
  projectID: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash transfer proxy',
      user_id,
      event_properties: {
        projectID,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}
