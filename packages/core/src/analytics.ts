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
  networkName: string,
  integration: Integration | undefined
) => {
  if (disableAnalytics) {
    return
  }
  await timeout(
    await amplitudeClient.logEvent({
      event_type: 'sphinx executed',
      user_id,
      event_properties: {
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackRegistrationFinalized = async (
  user_id: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  await timeout(
    await amplitudeClient.logEvent({
      event_type: 'sphinx registration finalized',
      user_id,
      event_properties: {
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackProposed = async (
  user_id: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'sphinx propose',
      user_id,
      event_properties: {
        integration,
      },
    }),
    10000
  )
}

export const trackApproved = async (
  user_id: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'sphinx approve',
      user_id,
      event_properties: {
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackDeployed = async (
  user_id: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'sphinx deploy',
      user_id,
      event_properties: {
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackCancel = async (
  user_id: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'sphinx cancel',
      user_id,
      event_properties: {
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
      event_type: 'sphinx list projects',
      user_id,
      event_properties: {
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackExportProxy = async (
  user_id: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'sphinx export proxy',
      user_id,
      event_properties: {
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackImportProxy = async (
  user_id: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'sphinx import proxy',
      user_id,
      event_properties: {
        network: networkName,
        integration,
      },
    }),
    10000
  )
}
