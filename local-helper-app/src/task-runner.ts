import {
  buildObservationArtifacts,
  createSiteHarness,
  type BrowserHarnessRuntime,
  type LocalHelperTask,
} from './site-harness.ts';
import { profileFor } from './site-profiles.ts';

export type CloudTaskChannel = {
  start: (taskId: string, payload?: Record<string, unknown>) => Promise<unknown>;
  continue: (taskId: string, payload: Record<string, unknown>) => Promise<unknown>;
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
  observation: { screenshotPath?: string };
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

export const runLocalHelperTask = async ({
  task,
  browser,
  cloud,
}: {
  task: LocalHelperTask;
  browser: BrowserHarnessRuntime;
  cloud: CloudTaskChannel;
}) => {
  await cloud.start(task.id, {
    entryUrl: task.entryUrl,
    sourceName: task.sourceName,
  });

  const harness = createSiteHarness({ browser, profile: profileFor(task.sourceName) });
  const result = await withScreenshot(await harness.openTask(task), browser);

  await cloud.continue(task.id, {
    status: 'request_human',
    requestHuman: true,
    humanReason: result.humanReason || '采集浏览器已打开。请完成登录/验证，并停留在公告列表或搜索结果页后点击继续采集。',
    currentUrl: result.observation.url,
    observation: observationText(result),
    screenshotPath: result.observation.screenshotPath || '',
    artifacts: artifactsFor(result, task),
    action: 'open_task',
  });

  return {
    ...result,
    status: 'request_human',
    humanReason: result.humanReason || '采集浏览器已打开。请完成登录/验证，并停留在公告列表或搜索结果页后点击继续采集。',
    candidateBundle: null,
  };
};

export const continueLocalHelperTaskAfterHuman = async ({
  task,
  browser,
  cloud,
}: {
  task: LocalHelperTask;
  browser: BrowserHarnessRuntime;
  cloud: CloudTaskChannel;
}) => {
  const harness = createSiteHarness({ browser, profile: profileFor(task.sourceName) });
  const result = await withScreenshot(await harness.continueTask(task), browser);

  if (result.status === 'request_human') {
    await cloud.continue(task.id, {
      status: 'request_human',
      requestHuman: true,
      humanReason: result.humanReason,
      currentUrl: result.observation.url,
      observation: observationText(result),
      screenshotPath: result.observation.screenshotPath || '',
      artifacts: artifactsFor(result, task),
      action: 'continue_after_human',
    });
    return result;
  }

  const cloudResult = await cloud.continue(task.id, {
    status: 'completed',
    currentUrl: result.observation.url,
    observation: observationText(result),
    screenshotPath: result.observation.screenshotPath || '',
    action: 'continue_after_human',
    artifacts: artifactsFor(result, task),
    candidateBundle: result.candidateBundle,
  });

  const ingestion = (cloudResult as {
    ingestion?: {
      status?: string;
      createdCount?: number;
      resultSummary?: string;
    };
    status?: string;
    nextAction?: { reason?: string };
  } | null)?.ingestion;

  if (
    (cloudResult as { status?: string } | null)?.status === 'request_human' ||
    ingestion?.status === 'request_human' ||
    (typeof ingestion?.createdCount === 'number' && ingestion.createdCount === 0)
  ) {
    return {
      ...result,
      status: 'request_human',
      humanReason: ingestion?.resultSummary ||
        (cloudResult as { nextAction?: { reason?: string } } | null)?.nextAction?.reason ||
        '本次采集没有生成可入库商机。请进入具体公告列表或按搜索词筛选后再次点击继续采集。',
    };
  }

  return {
    ...result,
    status: 'completed',
  };
};
