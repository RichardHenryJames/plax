// The Google Play build by default; a test changes it with setVariant() from src/test/helpers.ts.
export const mock = { applicationId: 'com.plaxlabs.news' as string | null, nativeApplicationVersion: '2.0.0' as string | null, nativeBuildVersion: '20' as string | null }

export default mock
module.exports = {
  __esModule: true,
  get applicationId() {
    return mock.applicationId
  },
  get nativeApplicationVersion() {
    return mock.nativeApplicationVersion
  },
  get nativeBuildVersion() {
    return mock.nativeBuildVersion
  },
  mock,
}
