import { persistCollectionNotices } from './persist-report.ts';
import { collectPublicSite } from './collect-site.ts';
import { PUBLIC_SITES, taskForSite } from '../sites/registry.ts';
import { PocketBaseBidNoticeRepository } from '../infrastructure/pocketbase-repository.ts';
import { PocketBaseBidRunRepository } from '../infrastructure/run-repository.ts';
import type { PocketBaseClient } from '../infrastructure/pocketbase-client.ts';

const TIME_ZONE = 'Asia/Shanghai';
export const BID_RECORD_RETENTION_DAYS = 10;

export const bidRetentionCutoff = (now: Date) => new Date(
  now.getTime() - BID_RECORD_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
).toISOString();

export const shanghaiDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date);

const shanghaiMinutes = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === 'hour')?.value || 0) * 60
    + Number(parts.find((part) => part.type === 'minute')?.value || 0);
};

const alreadyRanToday = (value: string | undefined, now: Date) => {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) && shanghaiDate(parsed) === shanghaiDate(now);
};

const dueNow = (scheduleTime: string, now: Date) => {
  const [hours, minutes] = String(scheduleTime || '08:00').split(':').map(Number);
  return shanghaiMinutes(now) >= hours * 60 + minutes;
};

export const createDailyBidRunner = ({
  client,
  env = process.env,
}: {
  client: PocketBaseClient;
  env?: Record<string, string | undefined>;
}) => {
  const noticeRepository = new PocketBaseBidNoticeRepository(client);
  const runRepository = new PocketBaseBidRunRepository(client);
  let running = false;
  let lastCleanupDate = '';

  const run = async ({ force = false, sourceKeys = [] }: { force?: boolean; sourceKeys?: string[] } = {}) => {
    if (running) return { skipped: true, reason: 'already_running', results: [] };
    running = true;
    const results: Array<Record<string, unknown>> = [];
    const now = new Date();
    try {
      const sources = await runRepository.listSources();
      const siteByKey = new Map(PUBLIC_SITES.map((site) => [site.sourceKey, site]));
      const selected = sources.filter((source) => source.enabled
        && siteByKey.has(source.source_key)
        && (!sourceKeys.length || sourceKeys.includes(source.source_key))
        && (force || (dueNow(source.schedule_time, now) && !alreadyRanToday(source.last_run_at, now))));
      for (const source of selected) {
        const site = siteByKey.get(source.source_key);
        if (!site) continue;
        const startedAt = new Date().toISOString();
        await runRepository.markRunning(source, startedAt);
        try {
          const output = await collectPublicSite({ site, task: taskForSite(site), env });
          if (output.feed.status === 'failed' && !output.bundle) {
            throw new Error(output.feed.warnings.join('；') || '公开接口采集失败');
          }
          const persistence = await persistCollectionNotices({
            notices: [...output.report.currentItems, ...output.report.attentionItems],
            repository: noticeRepository,
          });
          const warningCount = output.feed.warnings.length;
          const status = warningCount ? 'partial' : persistence.created.length ? 'success' : 'no_new';
          const counts = {
            newCount: persistence.created.length,
            updatedCount: persistence.updated.length,
            duplicateCount: persistence.duplicateCount + persistence.batchDuplicateCount,
          };
          await runRepository.upsertRun({
            source,
            runDate: shanghaiDate(now),
            startedAt,
            finishedAt: new Date().toISOString(),
            status,
            report: output.report,
            counts,
            errorMessage: output.feed.warnings.join('；'),
          });
          results.push({ sourceKey: site.sourceKey, status, ...counts, report: output.report.summary });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await runRepository.upsertRun({
            source,
            runDate: shanghaiDate(now),
            startedAt,
            finishedAt: new Date().toISOString(),
            status: 'failed',
            counts: { newCount: 0, updatedCount: 0, duplicateCount: 0 },
            errorMessage: message,
          });
          results.push({ sourceKey: site.sourceKey, status: 'failed', error: message });
        }
      }
      if (lastCleanupDate !== shanghaiDate(now)) {
        const cutoff = bidRetentionCutoff(now);
        const cleanup = await runRepository.cleanupBefore(cutoff);
        lastCleanupDate = shanghaiDate(now);
        results.push({ cleanup });
      }
      return { skipped: false, results };
    } finally {
      running = false;
    }
  };

  return { run, isRunning: () => running };
};
