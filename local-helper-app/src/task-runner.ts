import {
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

const withScreenshot = async <T extends {
  observation: { screenshotPath?: string };
}>(
  result: T,
  browser: BrowserHarnessRuntime,
): Promise<T> => {
  if (!browser.screenshot) return result;
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

  if (result.status === 'request_human') {
    await cloud.continue(task.id, {
      status: 'request_human',
      requestHuman: true,
      humanReason: result.humanReason,
      currentUrl: result.observation.url,
      observation: observationText(result),
      screenshotPath: result.observation.screenshotPath || '',
      action: 'open_task',
    });
    return result;
  }

  await cloud.continue(task.id, {
    status: 'completed',
    currentUrl: result.observation.url,
    observation: observationText(result),
    screenshotPath: result.observation.screenshotPath || '',
    action: 'extract_candidate_bundle',
    candidateBundle: result.candidateBundle,
  });

  return {
    ...result,
    status: 'completed',
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
      action: 'continue_after_human',
    });
    return result;
  }

  await cloud.continue(task.id, {
    status: 'completed',
    currentUrl: result.observation.url,
    observation: observationText(result),
    screenshotPath: result.observation.screenshotPath || '',
    action: 'continue_after_human',
    candidateBundle: result.candidateBundle,
  });

  return {
    ...result,
    status: 'completed',
  };
};
