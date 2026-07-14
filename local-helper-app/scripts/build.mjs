import fs from 'node:fs';

import esbuild from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: ['electron', 'playwright'],
};

const outputDir = 'app-dist';
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

await Promise.all([
  esbuild.build({
    ...shared,
    entryPoints: ['src/main.ts'],
    outfile: `${outputDir}/main.js`,
  }),
  esbuild.build({
    ...shared,
    entryPoints: ['src/electron-main.ts'],
    outfile: `${outputDir}/electron-main.js`,
  }),
]);

// Renderer is static and intentionally framework-free.
fs.cpSync('src/renderer', `${outputDir}/renderer`, { recursive: true });
