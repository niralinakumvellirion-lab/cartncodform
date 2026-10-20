module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  verbose: true,
  // Allow JSX files from the frontend to be transformed by babel-jest.
  // The default pattern excludes node_modules; frontend source is not in
  // node_modules so it is transformed by the babel.config.js overrides.
  transformIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    // Force a single React copy so the backend react-dom and the mocked
    // 'react' module are all the same instance (avoids "invalid hook call").
    '^react$': '<rootDir>/node_modules/react',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^react-dom/(.*)$': '<rootDir>/node_modules/react-dom/$1',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    // Mocks for imports inside Discounts.jsx
    '^../../../lib/api(\\.js)?$': '<rootDir>/__mocks__/lib-api.js',
    '^./QuantityTiers(\\.jsx?)?$': '<rootDir>/__mocks__/QuantityTiers.js',
  },
};
