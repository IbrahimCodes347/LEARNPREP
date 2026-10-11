module.exports = {
  testEnvironment: 'node',
  testTimeout: 60000,
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setupAfterEnv.js'],
  transform: {},
  collectCoverageFrom: ['src/services/**/*.js', 'src/middlewares/**/*.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  verbose: true
};