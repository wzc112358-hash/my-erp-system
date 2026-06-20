import { createLocalApiServer } from './local-api.ts';
import { createTaskStore } from './task-store.ts';

const port = Number(process.env.HCZ_LOCAL_HELPER_PORT || 17321);
const store = createTaskStore();

if (process.env.HCZ_LOCAL_HELPER_DEMO_TASKS !== '0') {
  store.createTask({
    sourceName: '裕龙招投标网',
    searchTerms: '裕龙石化 缓蚀剂',
  });
}

const server = createLocalApiServer({ store, port });

await server.start();
console.log(`HCZ local helper API listening on ${server.url()}`);

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
