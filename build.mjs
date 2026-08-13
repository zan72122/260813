import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019', 'safari14'],
  outfile: 'app.js',
  logLevel: 'info',
});
