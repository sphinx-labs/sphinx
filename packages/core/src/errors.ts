/**
 * An error that should only be thrown if there's a bug in Sphinx.
 */
export class InvariantError extends Error {
  constructor(message: string) {
    super(
      `${message}.\n` +
        `Should never happen. Please report this error to the Sphinx team.`
    )
    this.name = 'InvariantError'
  }
}
