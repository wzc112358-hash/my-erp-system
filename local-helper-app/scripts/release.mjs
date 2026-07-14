import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
let releaseDir = process.env.HCZ_RELEASE_DIR
  ? path.resolve(process.env.HCZ_RELEASE_DIR)
  : path.join(root, 'release');
const downloadsDir = process.env.HCZ_DOWNLOADS_DIR
  ? path.resolve(process.env.HCZ_DOWNLOADS_DIR)
  : path.resolve(root, '..', 'frontend', 'public', 'downloads');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const run = (command, args, options = {}) => {
  execFileSync(command, args, {
    stdio: 'inherit',
    cwd: root,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });
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

const resetReleaseDir = () => {
  try {
    fs.rmSync(releaseDir, { recursive: true, force: true });
  } catch (error) {
    if (process.env.HCZ_RELEASE_DIR || error?.code !== 'EACCES') throw error;
    const fallback = path.join(root, 'release-user');
    console.warn(`Cannot clean ${releaseDir} because of permissions; using ${fallback} instead.`);
    releaseDir = fallback;
    fs.rmSync(releaseDir, { recursive: true, force: true });
  }
};

const outputConfigArg = () => {
  const relative = path.relative(root, releaseDir);
  return `--config.directories.output=${relative && !relative.startsWith('..') ? relative : releaseDir}`;
};

const copyReplacing = (source, target) => {
  fs.rmSync(target, { force: true });
  fs.copyFileSync(source, target);
};

resetReleaseDir();
run('npm', ['run', 'build']);
run('npx', ['electron-builder', '--win', 'zip', 'dir', '--x64', outputConfigArg()]);
const shouldBuildInstaller = process.env.HCZ_SKIP_NSIS !== '1';
let installerBuilt = false;
if (shouldBuildInstaller) {
  try {
    run('npx', ['electron-builder', '--win', 'nsis', '--x64', outputConfigArg()]);
    installerBuilt = true;
  } catch (error) {
    console.warn(`Skipping NSIS installer after build failure: ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  console.warn('Skipping NSIS installer because HCZ_SKIP_NSIS=1.');
}
run('npm', ['run', 'verify:package'], { env: { HCZ_RELEASE_DIR: releaseDir } });

fs.mkdirSync(downloadsDir, { recursive: true });

const portableSource = newestFile((filePath) => filePath.endsWith('.zip'));
const installerSource = installerBuilt
  ? newestFile((filePath) => filePath.endsWith('.exe') && !filePath.includes('win-unpacked') && fs.statSync(filePath).size > 1024 * 1024)
  : null;
if (!portableSource) throw new Error('portable zip was not generated');

const portableTarget = path.join(downloadsDir, 'hcz-local-helper-app.zip');
const installerTarget = path.join(downloadsDir, 'hcz-local-helper-setup.exe');
const blockmapTarget = path.join(downloadsDir, 'hcz-local-helper-setup.exe.blockmap');
copyReplacing(portableSource, portableTarget);
if (installerSource) {
  copyReplacing(installerSource, installerTarget);
  const blockmapSource = `${installerSource}.blockmap`;
  if (fs.existsSync(blockmapSource)) copyReplacing(blockmapSource, blockmapTarget);
} else {
  if (fs.existsSync(installerTarget)) fs.rmSync(installerTarget);
  if (fs.existsSync(blockmapTarget)) fs.rmSync(blockmapTarget);
}

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
