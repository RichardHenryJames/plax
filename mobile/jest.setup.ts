// Runs before each test file: the same clean phone for every test.
import { setAnimationsEnabled } from './src/ui/motion'

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
setAnimationsEnabled(false)
