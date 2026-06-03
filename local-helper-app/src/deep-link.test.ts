import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDeepLink } from './deep-link.ts';

test('deep link parser extracts task launch requests', () => {
  const parsed = parseDeepLink('hcz-helper://task/cloud-task-huajin?source=huajin');

  assert.deepEqual(parsed, {
    type: 'task',
    taskId: 'cloud-task-huajin',
    params: { source: 'huajin' },
  });
});

test('deep link parser extracts pair-code requests', () => {
  const parsed = parseDeepLink('hcz-helper://pair?cloudUrl=https%3A%2F%2Fagent.henghuacheng.cn&code=ABCD1234');

  assert.deepEqual(parsed, {
    type: 'pair',
    cloudUrl: 'https://agent.henghuacheng.cn',
    code: 'ABCD1234',
    params: {
      cloudUrl: 'https://agent.henghuacheng.cn',
      code: 'ABCD1234',
    },
  });
});

test('deep link parser rejects unsupported protocols and missing task ids', () => {
  assert.equal(parseDeepLink('https://example.com').type, 'unknown');
  assert.equal(parseDeepLink('hcz-helper://task').type, 'unknown');
  assert.equal(parseDeepLink('').type, 'unknown');
});
