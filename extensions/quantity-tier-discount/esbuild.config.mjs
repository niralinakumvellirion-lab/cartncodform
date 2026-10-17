import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/run.js'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
});
