import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const root = process.cwd();
const releaseDir = process.env.HCZ_RELEASE_DIR
  ? path.resolve(process.env.HCZ_RELEASE_DIR)
  : path.join(root, 'release');
const resourcesDir = path.join(releaseDir, 'win-unpacked', 'resources');
const appAsar = path.join(resourcesDir, 'app.asar');
const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');

const fail = (message) => {
  throw new Error(`package verification failed: ${message}`);
};

if (!fs.existsSync(appAsar)) {
  fail(`missing ${appAsar}`);
}

const packageEntries = new Set(
  asar.listPackage(appAsar).map((entry) => entry.replace(/^[/\\]+/, '').replace(/\\/g, '/')),
);
const hasRendererAsset = (entry) => packageEntries.has(entry) ||
  fs.existsSync(path.join(unpackedDir, entry));

for (const entry of [
  'app-dist/renderer/pair.html',
  'app-dist/renderer/pair.js',
  'app-dist/renderer/tasks.html',
  'app-dist/renderer/tasks-minimal.js',
]) {
  if (!hasRendererAsset(entry)) fail(`renderer asset missing: ${entry}`);
}

const packagedManifest = JSON.parse(asar.extractFile(appAsar, 'package.json').toString('utf8'));
if (packagedManifest.main !== 'app-dist/electron-main.js') {
  fail(`unexpected packaged main: ${packagedManifest.main}`);
}

const electronMain = asar.extractFile(appAsar, 'app-dist/electron-main.js').toString('utf8');
if (!electronMain.includes('app-dist')) {
  fail('electron-main does not reference app-dist');
}
if (
  electronMain.includes('app.asar.unpacked", "dist", "renderer"') ||
  electronMain.includes("app.asar.unpacked', 'dist', 'renderer'") ||
  electronMain.includes('app.asar.unpacked/dist/renderer')
) {
  fail('electron-main still references the legacy dist renderer path');
}

console.log(`Verified local helper package at ${releaseDir}`);
