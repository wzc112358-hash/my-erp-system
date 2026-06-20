import {
  buildObservationArtifacts,
  createSiteHarness,
  type BrowserHarnessRuntime,
  type CandidateBundle,
  type LocalHelperArtifact,
  type LocalHelperTask,
} from './site-harness.ts';
import { profileFor } from './site-profiles.ts';

export type LocalAgentRunResult = {
  status: 'request_human' | 'completed' | 'failed';
  humanReason: string;
  observation?: {
    title?: string;
    url?: string;
    visibleText?: string;
    screenshotPath?: string;
  };
  candidateBundle: CandidateBundle | null;
  artifacts: LocalHelperArtifact[];
  resultSummary: string;
};

const observationText = (result: {
  observation?: { title?: string; url?: string; visibleText?: string };
}) => [
  result.observation?.title,
  result.observation?.url,
  result.observation?.visibleText,
].filter(Boolean).join('\n').slice(0, 8000);

const artifactsFor = (
  result: { observation?: Parameters<typeof buildObservationArtifacts>[0] },
  task: LocalHelperTask,
) => result.observation ? buildObservationArtifacts(result.observation, task) : [];

const withScreenshot = async <T extends {
  observation: { screenshotPath?: string; url?: string };
}>(
  result: T,
  browser: BrowserHarnessRuntime,
): Promise<T> => {
  if (!browser.screenshot) return result;
  if (!result.observation?.url) return result;
  const screenshotPath = await browser.screenshot().catch(() => '');
  if (!screenshotPath) return result;
  return {
    ...result,
    observation: {
      ...result.observation,
      screenshotPath,
    },
  };
};

export const summarizeCandidateBundle = (bundle: CandidateBundle | null) => {
  const count = bundle?.candidates?.length || 0;
  if (count === 0) return '本次采集没有识别到可入库候选，请调整搜索词或进入公告列表后继续采集。';
  return `本次采集识别到 ${count} 条候选公告，请确认后上传 ERP 或生成群摘要。`;
};

export const openLocalAgentTask = async ({
  task,
  browser,
}: {
  task: LocalHelperTask;
  browser: BrowserHarnessRuntime;
}): Promise<LocalAgentRunResult> => {
  const harness = createSiteHarness({ browser, profile: profileFor(task.sourceName) });
  const result = await withScreenshot(await harness.openTask(task), browser);
  const humanReason = result.humanReason ||
    '采集浏览器已打开。请完成登录/验证，按搜索词筛选到公告列表或详情页后点击继续采集。';

  return {
    status: 'request_human',
    humanReason,
    observation: result.observation,
    candidateBundle: null,
    artifacts: artifactsFor(result, task),
    resultSummary: humanReason,
  };
};

export const continueLocalAgentTaskAfterHuman = async ({
  task,
  browser,
}: {
  task: LocalHelperTask;
  browser: BrowserHarnessRuntime;
}): Promise<LocalAgentRunResult> => {
  const harness = createSiteHarness({ browser, profile: profileFor(task.sourceName) });
  const result = await withScreenshot(await harness.continueTask(task), browser);
  const artifacts = artifactsFor(result, task);

  if (result.status === 'request_human') {
    return {
      status: 'request_human',
      humanReason: result.humanReason,
      observation: result.observation,
      candidateBundle: null,
      artifacts,
      resultSummary: result.humanReason,
    };
  }

  return {
    status: 'completed',
    humanReason: '',
    observation: result.observation,
    candidateBundle: result.candidateBundle,
    artifacts,
    resultSummary: summarizeCandidateBundle(result.candidateBundle),
  };
};

export const buildLocalAgentLog = (result: LocalAgentRunResult, defaultLog = '') => [
  defaultLog,
  result.humanReason ? `需要人工处理：${result.humanReason}` : '',
  result.observation?.url ? `当前地址：${result.observation.url}` : '',
  result.resultSummary ? `结果摘要：${result.resultSummary}` : '',
  observationText(result) ? `页面观察：${observationText(result)}` : '',
].filter(Boolean).join('\n');
