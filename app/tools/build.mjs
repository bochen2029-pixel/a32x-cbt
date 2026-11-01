// Bundle the page into one classic script so it runs from file:// with no server and no Node.
// TypeScript is typechecked separately (`npm run typecheck`); this only emits.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/app/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'web/app.js',
  loader: { '.json': 'json' },
  logLevel: 'warning',
});

console.log('built web/app.js');
