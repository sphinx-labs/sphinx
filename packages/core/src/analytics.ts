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
  organizationID: string,
  projectName: string,
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
        organizationID,
        projectName,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackRegistrationFinalized = async (
  user_id: string,
  organizationID: string,
  projectName: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  await timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash registration finalized',
      user_id,
      event_properties: {
        organizationID,
        projectName,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackProposed = async (
  user_id: string,
  organizationID: string,
  projectName: string,
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
        organizationID,
        projectName,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackApproved = async (
  user_id: string,
  organizationID: string,
  projectName: string,
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
        organizationID,
        projectName,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackDeployed = async (
  user_id: string,
  organizationID: string,
  projectName: string,
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
        organizationID,
        projectName,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackCancel = async (
  user_id: string,
  organizationID: string,
  projectName: string,
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
        organizationID,
        projectName,
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

export const trackExportProxy = async (
  user_id: string,
  organizationID: string,
  projectName: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash export proxy',
      user_id,
      event_properties: {
        organizationID,
        projectName,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}

export const trackImportProxy = async (
  user_id: string,
  organizationID: string,
  projectName: string,
  networkName: string,
  integration: Integration
) => {
  if (disableAnalytics) {
    return
  }
  timeout(
    await amplitudeClient.logEvent({
      event_type: 'chugsplash import proxy',
      user_id,
      event_properties: {
        organizationID,
        projectName,
        network: networkName,
        integration,
      },
    }),
    10000
  )
}
