module.exports = {
  testEnvironment: 'node',
  transform: {
    '\\.(ts)$': 'ts-jest',
  },
  testMatch: ['**/*.+(spec|test).(ts|js)'],
  preset: 'ts-jest',
  testPathIgnorePatterns: ['/lib/', '/node_modules/'],
  displayName: 'language-server',
  verbose: true,
};
