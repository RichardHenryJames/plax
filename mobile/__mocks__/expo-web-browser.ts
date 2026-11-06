// The browser the app opens for links and for Google sign-in. A test queues what the browser "returns" with __nextAuthResult().
export type AuthResult = { type: 'success'; url: string } | { type: 'cancel' } | { type: 'dismiss' } | { type: 'locked' }

const queued: AuthResult[] = []
export const opened: { url: string; redirect?: string }[] = []

export const openBrowserAsync = jest.fn(async (url: string) => {
  opened.push({ url })
  return { type: 'opened' }
})
export const openAuthSessionAsync = jest.fn(async (url: string, redirect?: string): Promise<AuthResult> => {
  opened.push({ url, redirect })
  return queued.shift() ?? { type: 'cancel' }
})
export const maybeCompleteAuthSession = jest.fn(() => ({ type: 'failed', message: 'Not in a web browser' }))
export const warmUpAsync = jest.fn(async () => ({}))
export const coolDownAsync = jest.fn(async () => ({}))

export const __nextAuthResult = (result: AuthResult) => {
  queued.push(result)
}
export const __reset = () => {
  queued.length = 0
  opened.length = 0
  openBrowserAsync.mockClear()
  openAuthSessionAsync.mockClear()
}
