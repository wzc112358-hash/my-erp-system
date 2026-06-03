import process from 'node:process';

import { createLocalHelperApiServer } from './local-helper-api.js';

const server = createLocalHelperApiServer();

await server.start();
console.log(`HCZ local helper cloud API listening on ${server.url()}`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
