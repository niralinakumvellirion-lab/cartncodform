const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^../../../lib/api$': '<rootDir>/__mocks__/api.js',
    '^./ChannelCards$': '<rootDir>/__mocks__/ChannelCards.js',
  },
  testMatch: ['**/__tests__/**/*.test.{js,jsx}'],
});
