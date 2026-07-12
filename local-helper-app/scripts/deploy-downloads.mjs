import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appRoot, '..');

const downloadsDir = process.env.HCZ_DOWNLOADS_DIR
  ? path.resolve(process.env.HCZ_DOWNLOADS_DIR)
  : path.resolve(repoRoot, 'frontend', 'public', 'downloads');
const sshKey = process.env.HCZ_SSH_KEY || path.resolve(repoRoot, '.ssh', 'id_ed25519');
const deployHost = process.env.HCZ_DEPLOY_HOST || 'root@182.92.78.227';
const remoteRepo = process.env.HCZ_REMOTE_REPO || '/actions-runner/_work/my-erp-system/my-erp-system';
const frontendContainer = process.env.HCZ_FRONTEND_CONTAINER || 'erp-frontend';

const files = [
  'hcz-local-helper-app.zip',
  'hcz-local-helper-setup.exe',
  'hcz-local-helper-setup.exe.blockmap',
  'hcz-local-helper-release.json',
  'SHA256SUMS.txt',
];

const remoteDistDownloads = `${remoteRepo}/frontend/dist/downloads`;
const remotePublicDownloads = `${remoteRepo}/frontend/public/downloads`;
const containerDownloads = '/usr/share/nginx/html/downloads';

const shQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const run = (command, args, options = {}) => {
  execFileSync(command, args, { stdio: 'inherit', ...options });
};

const runShell = (command) => {
  run('sh', ['-lc', command]);
};

const ssh = (remoteCommand) => {
  run('ssh', ['-i', sshKey, deployHost, remoteCommand]);
};

const ensureArtifacts = () => {
  for (const file of files) {
    const filePath = path.join(downloadsDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing release artifact: ${filePath}`);
    }
  }
};

const uploadToRemoteDir = (remoteDir) => {
  const tarFiles = files.map(shQuote).join(' ');
  const sshBase = `ssh -i ${shQuote(sshKey)} ${shQuote(deployHost)}`;
  runShell(`tar -C ${shQuote(downloadsDir)} -cf - ${tarFiles} | ${sshBase} ${shQuote(`tar -xf - -C ${remoteDir}`)}`);
};

ensureArtifacts();

ssh(`mkdir -p ${remoteDistDownloads} ${remotePublicDownloads}`);
uploadToRemoteDir(remoteDistDownloads);
uploadToRemoteDir(remotePublicDownloads);

const tarFiles = files.map(shQuote).join(' ');
const sshBase = `ssh -i ${shQuote(sshKey)} ${shQuote(deployHost)}`;
const containerCommand = `docker exec -i ${frontendContainer} sh -lc ${shQuote(`mkdir -p ${containerDownloads} && tar -xf - -C ${containerDownloads}`)}`;
runShell(`tar -C ${shQuote(downloadsDir)} -cf - ${tarFiles} | ${sshBase} ${shQuote(containerCommand)}`);

ssh([
  `cd ${remoteDistDownloads}`,
  'sha256sum hcz-local-helper-app.zip hcz-local-helper-setup.exe',
  `docker exec ${frontendContainer} sh -lc ${shQuote(`cd ${containerDownloads} && sha256sum hcz-local-helper-app.zip hcz-local-helper-setup.exe`)}`,
].join(' && '));

console.log(`Deployed local helper downloads from ${downloadsDir} to ${deployHost}.`);
