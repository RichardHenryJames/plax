// expo-updates as an app with the updates turned off sees it; a test sets what the "server" answers with __setUpdates().
export const state = {
  isEnabled: true,
  channel: 'production' as string | null,
  runtimeVersion: '2.0.0' as string | null,
  updateId: null as string | null,
  isEmbeddedLaunch: true,
  check: { isAvailable: false } as { isAvailable: boolean; manifest?: unknown } | Error,
  fetch: { isNew: false } as { isNew: boolean; manifest?: unknown } | Error,
}

module.exports = {
  __esModule: true,
  get isEnabled() {
    return state.isEnabled
  },
  get channel() {
    return state.channel
  },
  get runtimeVersion() {
    return state.runtimeVersion
  },
  get updateId() {
    return state.updateId
  },
  get isEmbeddedLaunch() {
    return state.isEmbeddedLaunch
  },
  checkForUpdateAsync: jest.fn(async () => {
    if (state.check instanceof Error) throw state.check
    return state.check
  }),
  fetchUpdateAsync: jest.fn(async () => {
    if (state.fetch instanceof Error) throw state.fetch
    return state.fetch
  }),
  reloadAsync: jest.fn(async () => undefined),
  state,
}
