import process from 'node:process';

import { createDailyBidRunner } from './application/daily-runner.ts';
import { reassessStoredBidNotices } from './application/reassess-existing.ts';
import { createBidApiServer } from './infrastructure/api-server.ts';
import { PocketBaseClient } from './infrastructure/pocketbase-client.ts';

const client = new PocketBaseClient({
  baseUrl: process.env.POCKETBASE_URL || 'http://127.0.0.1:8090',
  identity: process.env.POCKETBASE_SUPERUSER_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL || '',
  password: process.env.POCKETBASE_SUPERUSER_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD || '',
});
const runner = createDailyBidRunner({ client });

const command = process.argv[2] || 'serve';
if (command === 'run-once') {
  const sourceArg = process.argv.find((item) => item.startsWith('--source='));
  const sourceKeys = sourceArg ? sourceArg.slice('--source='.length).split(',').filter(Boolean) : [];
  runner.run({ force: true, sourceKeys }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (command === 'reassess-notices') {
  const limitArg = process.argv.find((item) => item.startsWith('--limit='));
  const limit = Number(limitArg?.slice('--limit='.length) || 0);
  const onlyMissing = !process.argv.includes('--all');
  reassessStoredBidNotices({
    client,
    onlyMissing,
    limit,
    onProgress: (message) => console.log(`[bid-reassessment] ${message}`),
  }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (command === 'serve') {
  const server = createBidApiServer({ client });
  const schedulerEnabled = process.env.BID_AGENT_SCHEDULER_ENABLED !== '0';
  const timer = schedulerEnabled ? setInterval(() => {
      void runner.run().then((result) => {
        if (result.results.length) console.log(JSON.stringify(result));
      }).catch((error) => console.error('[bid-scheduler]', error));
    }, Number(process.env.BID_AGENT_INTERVAL_MS || 60_000)) : null;
  void server.start().then(() => {
    console.log(`ERP bid agent listening on ${server.url()}`);
    if (schedulerEnabled && process.env.BID_AGENT_RUN_ON_STARTUP !== '0') {
      void runner.run().then((result) => {
        if (result.results.length) console.log(JSON.stringify(result));
      }).catch((error) => console.error('[bid-startup-run]', error));
    }
  }).catch((error) => {
    // Only a failure to start the API is fatal. A temporary PocketBase/site
    // outage during the startup scan must not take the authenticated read API
    // down or trigger a container restart loop.
    console.error(error);
    process.exit(1);
  });
  const shutdown = () => {
    if (timer) clearInterval(timer);
    void server.stop().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
