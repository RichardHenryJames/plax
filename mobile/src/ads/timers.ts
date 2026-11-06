/** Timers as an object, so that a test can drive them: Jest's fake timers replace the globals, which are read again at each call. */
export interface Timers {
  set(callback: () => void, ms: number): unknown
  clear(handle: unknown): void
}

export const systemTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
}
