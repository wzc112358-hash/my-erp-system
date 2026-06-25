import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAgentToolRunner,
  createBiddingAgentToolbox,
  createDocumentReaderTool,
  createRecordingBrowserTool,
} from './agent-toolbox.ts';

test('agent tool runner records summarized tool calls', async () => {
  const steps: any[] = [];
  const runner = createAgentToolRunner({
    recordStep: (step) => steps.push(step),
    now: (() => {
      let value = 100;
      return () => {
        value += 25;
        return value;
      };
    })(),
  });

  const output = await runner.call({
    name: 'demo.echo',
    kind: 'utility',
    description: 'Echo a value.',
    invoke: async ({ value }: { value: string }) => ({ echoed: value }),
    summarize: (result) => ({ echoed: result.echoed }),
  }, { value: 'ok' }, {
    phase: 'plan',
    action: 'echo_value',
    observeInput: true,
  });

  assert.deepEqual(output, { echoed: 'ok' });
  assert.equal(steps[0].phase, 'plan');
  assert.equal(steps[0].action, 'echo_value');
  assert.equal(steps[0].tool, 'demo.echo');
  assert.deepEqual(steps[0].observation, { value: 'ok' });
  assert.equal(steps[0].result.echoed, 'ok');
  assert.equal(steps[0].result.durationMs, 25);
});

test('bidding agent toolbox exposes search, browser, and document tools', () => {
  const toolbox = createBiddingAgentToolbox({
    task: {
      id: 'task-1',
      sourceName: '能源一号',
      entryUrl: 'https://example.com',
      searchTerms: '阻聚剂',
    },
    search: {
      name: 'mock-search',
      discoverLinks: async () => ({
        provider: 'mock',
        query: '阻聚剂',
        links: [],
        warnings: [],
      }),
    },
    browser: {
      name: 'mock-browser',
      open: async (url) => ({ title: '', url, visibleText: '' }),
      observe: async () => ({ title: '', url: '', visibleText: '' }),
      screenshot: async () => '',
    },
  });

  assert.deepEqual(toolbox.manifests().map((tool) => tool.kind), [
    'search',
    'browser',
    'browser',
    'browser',
    'document',
  ]);
  assert.equal(toolbox.linkDiscovery.name, 'link_discovery.search');
  assert.equal(toolbox.documentRead.name, 'documents.read');
});

test('recording browser tool wraps browser actions as agent tools', async () => {
  const actions: string[] = [];
  const steps: any[] = [];
  const runner = createAgentToolRunner({ recordStep: (step) => steps.push(step) });
  const browser = createRecordingBrowserTool({
    runner,
    browser: {
      name: 'mock-cdp',
      open: async (url) => {
        actions.push(`open:${url}`);
        return { title: '公告', url, visibleText: '阻聚剂采购公告' };
      },
      observe: async () => {
        actions.push('observe');
        return { title: '公告', url: 'https://example.com/list', visibleText: '公告列表' };
      },
      screenshot: async () => {
        actions.push('screenshot');
        return '/tmp/hcz/s.png';
      },
    },
  });

  await browser.open('https://example.com/list');
  await browser.observe();
  const screenshot = await browser.screenshot();

  assert.deepEqual(actions, ['open:https://example.com/list', 'observe', 'screenshot']);
  assert.equal(screenshot, '/tmp/hcz/s.png');
  assert.deepEqual(steps.map((step) => step.tool), [
    'mock-cdp.open',
    'mock-cdp.observe',
    'mock-cdp.screenshot',
  ]);
});

test('document reader tool delegates to the configured reader', async () => {
  const tool = createDocumentReaderTool({
    reader: async ({ observation }) => [{
      title: '采购文件.pdf',
      url: observation.url,
      text: '投标需厂家授权。',
    }],
  });

  const documents = await tool.invoke({
    observation: {
      title: '详情页',
      url: 'https://example.com/detail',
      visibleText: '下载采购文件',
    },
  });

  assert.equal(documents[0].title, '采购文件.pdf');
  assert.deepEqual(tool.summarize?.(documents, {
    observation: {
      title: '',
      url: '',
      visibleText: '',
    },
  }), {
    documentCount: 1,
    documents: [{
      title: '采购文件.pdf',
      url: 'https://example.com/detail',
      filePath: '',
      contentType: '',
      textLength: 8,
      warning: '',
    }],
  });
});

