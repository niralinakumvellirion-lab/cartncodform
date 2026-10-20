module.exports = {
  // Only activate transforms for frontend JSX files; plain CJS backend tests
  // get no transformation (babel no-ops on files with no matching overrides).
  overrides: [
    {
      test: /\.jsx$/,
      presets: [['@babel/preset-react', { runtime: 'automatic' }]],
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    },
  ],
};
