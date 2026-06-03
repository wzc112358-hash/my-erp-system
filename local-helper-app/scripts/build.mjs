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

await Promise.all([
  esbuild.build({
    ...shared,
    entryPoints: ['src/main.ts'],
    outfile: 'dist/main.js',
  }),
  esbuild.build({
    ...shared,
    entryPoints: ['src/electron-main.ts'],
    outfile: 'dist/electron-main.js',
  }),
]);

// 配对界面是纯静态资源，直接拷贝到 dist（已包含在 electron-builder 的 dist/**/* 中）。
fs.rmSync('dist/renderer', { recursive: true, force: true });
fs.cpSync('src/renderer', 'dist/renderer', { recursive: true });

