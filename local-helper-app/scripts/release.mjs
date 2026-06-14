import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const releaseDir = path.join(root, 'release');
const downloadsDir = path.resolve(root, '..', 'frontend', 'public', 'downloads');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const run = (command, args) => {
  execFileSync(command, args, { stdio: 'inherit', cwd: root });
};

const commandExists = (command) => {
  try {
    execFileSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const sha256 = (filePath) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(filePath))
  .digest('hex');

const newestFile = (predicate) => fs
  .readdirSync(releaseDir)
  .map((name) => path.join(releaseDir, name))
  .filter((filePath) => fs.statSync(filePath).isFile())
  .filter(predicate)
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

fs.rmSync(releaseDir, { recursive: true, force: true });
run('npm', ['run', 'build']);
run('npx', ['electron-builder', '--win', 'zip', 'dir', '--x64']);
const canBuildInstaller = process.platform === 'win32' || commandExists('wine');
if (canBuildInstaller) {
  run('npx', ['electron-builder', '--win', 'nsis', '--x64']);
} else {
  console.warn('Skipping NSIS installer: wine is not installed. Run this script on Windows or install wine to publish hcz-local-helper-setup.exe.');
}

fs.mkdirSync(downloadsDir, { recursive: true });

const portableSource = newestFile((filePath) => filePath.endsWith('.zip'));
const installerSource = newestFile((filePath) => filePath.endsWith('.exe') && !filePath.includes('win-unpacked'));
if (!portableSource) throw new Error('portable zip was not generated');

const portableTarget = path.join(downloadsDir, 'hcz-local-helper-app.zip');
const installerTarget = path.join(downloadsDir, 'hcz-local-helper-setup.exe');
fs.copyFileSync(portableSource, portableTarget);
if (installerSource) fs.copyFileSync(installerSource, installerTarget);
if (!installerSource && fs.existsSync(installerTarget)) fs.rmSync(installerTarget);

const manifest = {
  productName: pkg.build?.productName || pkg.name,
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  files: {
    portable: {
      name: path.basename(portableTarget),
      url: '/downloads/hcz-local-helper-app.zip',
      sha256: sha256(portableTarget),
    },
    installer: installerSource ? {
      name: path.basename(installerTarget),
      url: '/downloads/hcz-local-helper-setup.exe',
      sha256: sha256(installerTarget),
    } : null,
  },
};

fs.writeFileSync(
  path.join(downloadsDir, 'hcz-local-helper-release.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);
fs.writeFileSync(
  path.join(downloadsDir, 'SHA256SUMS.txt'),
  [
    `${manifest.files.portable.sha256}  ${manifest.files.portable.name}`,
    manifest.files.installer ? `${manifest.files.installer.sha256}  ${manifest.files.installer.name}` : '',
    '',
  ].filter((line, index, lines) => line || index === lines.length - 1).join('\n'),
  'utf8',
);

console.log(`Published local helper ${pkg.version} artifacts to ${downloadsDir}`);
