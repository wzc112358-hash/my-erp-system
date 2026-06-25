import test from 'node:test';
import assert from 'node:assert/strict';

import { describeMcpToolPlans } from './mcp-tool-plans.ts';

test('MCP tool plans expose fallbacks and required environment status', () => {
  const missing = describeMcpToolPlans({ env: {} });
  const firecrawlMissing = missing.find((plan) => plan.id === 'firecrawl');
  const chrome = missing.find((plan) => plan.id === 'chrome-devtools');
  const pdf = missing.find((plan) => plan.id === 'pdf-reader');

  assert.equal(firecrawlMissing?.status, 'fallback');
  assert.deepEqual(firecrawlMissing?.missingEnv, ['FIRECRAWL_API_KEY']);
  assert.equal(firecrawlMissing?.fallbackAdapter, 'firecrawl-http+entry-url');
  assert.equal(chrome?.status, 'ready');
  assert.equal(chrome?.fallbackAdapter, 'playwright-cdp');
  assert.equal(pdf?.status, 'ready');
  assert.equal(pdf?.fallbackAdapter, 'builtin-document-reader');

  const configured = describeMcpToolPlans({ env: { FIRECRAWL_API_KEY: 'fc-test' } });
  assert.equal(configured.find((plan) => plan.id === 'firecrawl')?.status, 'ready');
});

