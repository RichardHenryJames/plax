// Runs before each test file: the same clean phone for every test.
import { setAnimationsEnabled } from './src/ui/motion'

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
// The splash screen is the phone's own: a test sees whether the app has let it go.
jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(async () => undefined),
  preventAutoHideAsync: jest.fn(async () => undefined),
  setOptions: jest.fn(),
}))
setAnimationsEnabled(false)
