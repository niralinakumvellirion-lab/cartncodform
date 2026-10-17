import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/run.js'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
});
