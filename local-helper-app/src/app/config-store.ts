import fs from 'node:fs';
import path from 'node:path';

import type { FeedbackLearningState } from './feedback-learning.ts';
import type { LocalSchedule } from './local-scheduler.ts';
import type { LocalLLMConfig } from './local-llm-agent.ts';
import type { CloudPairing } from './task-store.ts';

export type LocalHelperConfig = {
  cloudPairing?: CloudPairing;
  llm?: LocalLLMConfig;
  feedbackLearning?: FeedbackLearningState;
  localSchedules?: LocalSchedule[];
};

export type LocalConfigStore = {
  readCloudPairing(): CloudPairing | null;
  writeCloudPairing(pairing: CloudPairing): void;
  clearCloudPairing(): void;
  readLLMConfig(): LocalLLMConfig | null;
  writeLLMConfig(config: LocalLLMConfig): void;
  clearLLMConfig(): void;
  readFeedbackLearning(): FeedbackLearningState | null;
  writeFeedbackLearning(state: FeedbackLearningState): void;
  clearFeedbackLearning(): void;
  readLocalSchedules(): LocalSchedule[];
  writeLocalSchedules(schedules: LocalSchedule[]): void;
  clearLocalSchedules(): void;
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

  readLLMConfig() {
    return readJson(filePath).llm || null;
  },

  writeLLMConfig(llm) {
    writeJson(filePath, {
      ...readJson(filePath),
      llm,
    });
  },

  clearLLMConfig() {
    const config = readJson(filePath);
    delete config.llm;
    writeJson(filePath, config);
  },

  readFeedbackLearning() {
    return readJson(filePath).feedbackLearning || null;
  },

  writeFeedbackLearning(feedbackLearning) {
    writeJson(filePath, {
      ...readJson(filePath),
      feedbackLearning,
    });
  },

  clearFeedbackLearning() {
    const config = readJson(filePath);
    delete config.feedbackLearning;
    writeJson(filePath, config);
  },

  readLocalSchedules() {
    return readJson(filePath).localSchedules || [];
  },

  writeLocalSchedules(localSchedules) {
    writeJson(filePath, {
      ...readJson(filePath),
      localSchedules,
    });
  },

  clearLocalSchedules() {
    const config = readJson(filePath);
    delete config.localSchedules;
    writeJson(filePath, config);
  },
});
