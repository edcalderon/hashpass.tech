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
};
