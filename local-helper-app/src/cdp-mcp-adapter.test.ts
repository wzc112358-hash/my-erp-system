import test from 'node:test';
import assert from 'node:assert/strict';

import { createCdpMcpBrowserTool } from './cdp-mcp-adapter.ts';

test('cdp mcp browser tool delegates to the controlled browser runtime', async () => {
  const calls: string[] = [];
  const tool = createCdpMcpBrowserTool({
    browser: {
      open: async (url) => {
        calls.push(`open:${url}`);
        return { title: '公告', url, visibleText: '采购公告' };
      },
      observe: async () => {
        calls.push('observe');
        return { title: '公告', url: 'https://example.com', visibleText: '采购公告' };
      },
      screenshot: async () => {
        calls.push('screenshot');
        return '/tmp/hcz/s.png';
      },
    },
  });

  const opened = await tool.open('https://example.com/list');
  const observed = await tool.observe();
  const screenshot = await tool.screenshot();

  assert.equal(tool.name, 'playwright-cdp');
  assert.equal(opened.url, 'https://example.com/list');
  assert.equal(observed.visibleText, '采购公告');
  assert.equal(screenshot, '/tmp/hcz/s.png');
  assert.deepEqual(calls, ['open:https://example.com/list', 'observe', 'screenshot']);
});

