/**
 * What can go wrong between the phone and the account service, or in the phone's secure storage. Every message is a fixed text: never an
 * address, a header, a token or a part of an answer, so that an error can be passed on, kept or shown without leaking any of them.
 */
export class AccountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountError'
  }
}

/** The service answered and refused: a wrong or reused code, a revoked session, or a row it will not accept. */
export class Rejected extends AccountError {
  constructor(readonly status: number) {
    super(`Rejected with status ${status}`)
    this.name = 'Rejected'
  }
}

/** The access token is no longer accepted; refreshing it may help. */
export class Unauthorized extends Rejected {
  constructor() {
    super(401)
    this.name = 'Unauthorized'
  }
}

/** The phone's secure storage cannot keep the account's secrets right now. The reader is then not signed in. */
export class StorageError extends AccountError {
  constructor(message = 'Secure storage unavailable') {
    super(message)
    this.name = 'StorageError'
  }
}
