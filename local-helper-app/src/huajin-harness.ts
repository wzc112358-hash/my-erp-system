// 华锦兵器网 harness 现在是通用 site-harness 的一个薄封装（保留原有导出，兼容既有调用与测试）。
import {
  analyzeObservation,
  createSiteHarness,
  extractCandidateBundle,
  type BrowserHarnessRuntime,
  type BrowserObservation,
  type CandidateBundle,
  type LocalHelperTask,
} from './site-harness.ts';
import { profileFor } from './site-profiles.ts';

export type {
  BrowserObservation,
  BrowserHarnessRuntime,
  LocalHelperTask,
  CandidateBundle,
} from './site-harness.ts';

const HUAJIN_PROFILE = profileFor('华锦兵器网');

export const analyzeHuajinObservation = (observation: BrowserObservation) =>
  analyzeObservation(observation, HUAJIN_PROFILE);

export const extractHuajinCandidateBundle = (
  observation: BrowserObservation,
  task: LocalHelperTask,
): CandidateBundle => extractCandidateBundle(observation, task, HUAJIN_PROFILE);

export const createHuajinHarness = ({
  browser,
}: {
  browser: BrowserHarnessRuntime;
}) => createSiteHarness({ browser, profile: HUAJIN_PROFILE });
