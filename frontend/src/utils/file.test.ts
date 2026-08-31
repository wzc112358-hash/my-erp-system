import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_ATTACHMENT_FILE_SIZE,
  MAX_ATTACHMENT_FILE_SIZE_MB,
  assertAttachmentFileSize,
  extractAttachments,
} from './file.ts';

test('attachment limit is 100 MiB', () => {
  assert.equal(MAX_ATTACHMENT_FILE_SIZE_MB, 100);
  assert.equal(MAX_ATTACHMENT_FILE_SIZE, 100 * 1024 * 1024);
});

test('accepts an attachment at the configured size limit', () => {
  const file = new File([''], '合同.pdf');
  Object.defineProperty(file, 'size', { value: MAX_ATTACHMENT_FILE_SIZE });

  assert.doesNotThrow(() => assertAttachmentFileSize([file]));
});

test('rejects an attachment larger than the configured size limit', () => {
  const file = new File([''], '超大合同.pdf');
  Object.defineProperty(file, 'size', { value: MAX_ATTACHMENT_FILE_SIZE + 1 });

  assert.throws(
    () => assertAttachmentFileSize([file]),
    /超大合同\.pdf.*100 MB/,
  );
});

test('preserves direct File and existing filename attachment values', () => {
  const file = new File(['contract'], '合同.pdf');

  assert.deepEqual(extractAttachments([file, '已有附件.pdf']), [file, '已有附件.pdf']);
});
