import fs from 'node:fs';
import path from 'node:path';

import type { CloudPairing } from './task-store.ts';

export type LocalHelperConfig = {
  cloudPairing?: CloudPairing;
};

export type LocalConfigStore = {
  readCloudPairing(): CloudPairing | null;
  writeCloudPairing(pairing: CloudPairing): void;
  clearCloudPairing(): void;
};

const readJson = (filePath: string): LocalHelperConfig => {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
};

const writeJson = (filePath: string, config: LocalHelperConfig) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
};

export const createJsonFileConfigStore = (filePath: string): LocalConfigStore => ({
  readCloudPairing() {
    return readJson(filePath).cloudPairing || null;
  },

  writeCloudPairing(pairing) {
    writeJson(filePath, {
      ...readJson(filePath),
      cloudPairing: pairing,
    });
  },

  clearCloudPairing() {
    const config = readJson(filePath);
    delete config.cloudPairing;
    writeJson(filePath, config);
  },
});
