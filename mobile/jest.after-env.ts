import '@testing-library/react-native/matchers'

beforeEach(async () => {
  // A clean phone: nothing stored, the Google Play build, no fake clock left over from the test before.
  const storage = require('@react-native-async-storage/async-storage') as { clear?: () => Promise<void> }
  await storage.clear?.()
  ;(require('expo-secure-store') as { __reset: () => void }).__reset()
  ;(require('expo-web-browser') as { __reset: () => void }).__reset()
  const application = require('expo-application') as { mock: { applicationId: string | null; nativeApplicationVersion: string | null; nativeBuildVersion: string | null } }
  application.mock.applicationId = 'com.plaxlabs.news'
  application.mock.nativeApplicationVersion = '2.0.0'
  application.mock.nativeBuildVersion = '20'
})

afterEach(() => {
  jest.useRealTimers()
})
