export type SemVer = {
  major: string
  minor: string
  patch: string
}

/**
 * @param EXIT Exit the process without throwing an error. This cannot be caught in a try/catch.
 * @param THROW Throw an error. Can be caught in a try/catch. This should be the default
 * FailureAction in the Foundry plugin.
 */
export enum FailureAction {
  EXIT,
  THROW,
}
