/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.after-env.ts'],
  // The website's files, which are outside this folder, find their packages (Babel's helpers) here.
  modulePaths: ['<rootDir>/node_modules'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/../src/lib/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx', '<rootDir>/scripts/**/*.test.ts', '<rootDir>/scripts/**/*.test.js', '<rootDir>/plugins/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/android/'],
  // Files of the website are plain TypeScript (they import each other with their .ts extension); Babel compiles them like our own.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-google-mobile-ads|zustand))',
  ],
}
