import fs from 'node:fs';
import path from 'node:path';

import type { LocalLLMConfig } from '../llm/client.ts';
import type { CloudPairing, TaskStoreConfigStore } from './task-store.ts';

export type LocalHelperConfig = {
  cloudPairing?: CloudPairing;
  llm?: LocalLLMConfig;
};

export type LocalConfigStore = TaskStoreConfigStore;

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
  readCloudPairing: () => readJson(filePath).cloudPairing || null,
  writeCloudPairing(cloudPairing) {
    writeJson(filePath, { ...readJson(filePath), cloudPairing });
  },
  clearCloudPairing() {
    const config = readJson(filePath);
    delete config.cloudPairing;
    writeJson(filePath, config);
  },
  readLLMConfig: () => readJson(filePath).llm || null,
  writeLLMConfig(llm) {
    writeJson(filePath, { ...readJson(filePath), llm });
  },
  clearLLMConfig() {
    const config = readJson(filePath);
    delete config.llm;
    writeJson(filePath, config);
  },
});
