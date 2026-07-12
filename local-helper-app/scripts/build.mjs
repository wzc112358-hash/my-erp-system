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

// 配对界面是纯静态资源，直接拷贝到 app-dist（已包含在 electron-builder 的 app-dist/**/* 中）。
fs.cpSync('src/renderer', `${outputDir}/renderer`, { recursive: true });
