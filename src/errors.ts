/**
 * Error thrown when an execution is attempted while the relay is OPEN.
 */
export class RelayOpenError extends Error {
  constructor() {
    super('Relay is open. Call was not attempted.');
    this.name = 'RelayOpenError';
  }
}