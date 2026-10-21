module.exports = {
  // Only activate transforms for frontend JSX files and ESM JS files under
  // frontend/app/admin/lib/; plain CJS backend tests get no transformation.
  overrides: [
    {
      test: /\.jsx$/,
      presets: [['@babel/preset-react', { runtime: 'automatic' }]],
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    },
    {
      test: /frontend[\\/]app[\\/]admin[\\/]lib[\\/].+\.js$/,
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    },
  ],
};
