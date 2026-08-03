module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['json-summary', 'lcov', 'text'],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    // Expo route folders contain literal brackets. Escape them so Jest also
    // instruments rendered dynamic event routes instead of recording zeros.
    'app/events/[[]eventSlug[]]/**/*.{ts,tsx}',
    // Jest's glob expansion does not reliably instrument literal bracket route
    // names, so keep critical event flows as explicit coverage targets.
    'app/events/[eventSlug]/speakers/[id].tsx',
    'app/events/[eventSlug]/networking/my-requests.tsx',
    'app/api/events/[eventId]/meetings/limits+api.ts',
    'app/api/events/[eventId]/meetings/requests+api.ts',
    'components/**/*.{ts,tsx}',
    'contexts/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'providers/**/*.{ts,tsx}',
    'navigation/**/*.{ts,tsx}',
    'config/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/*.test.{ts,tsx}',
    '!**/*.spec.{ts,tsx}',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.expo/'],
  // jest-expo's preset only transforms RN/Expo-family packages (see its
  // jest-preset.js), leaving everything else in node_modules as raw ESM.
  // @noble/ciphers, @noble/curves, and @noble/hashes (the chat-encryption
  // crypto libs) ship pure ESM with no CJS build, so this extends that same
  // allow-list with @noble rather than replacing it outright.
  transformIgnorePatterns: [
    '/node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@noble/.*)',
    '/node_modules/react-native-reanimated/plugin/',
  ],
};
