import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export type OCRProvider = 'disabled' | 'baidu' | 'paddle';

export type LocalOCRConfig = {
  enabled?: boolean;
  provider?: OCRProvider;
  baiduApiKey?: string;
  baiduSecretKey?: string;
  paddleCommand?: string;
  paddleConfigPath?: string;
  paddleDevice?: string;
  updatedAt?: string;
};

export type OCRResult = {
  provider: Exclude<OCRProvider, 'disabled'>;
  text: string;
};

export type PaddleRunner = (input: {
  command: string;
  args: string[];
  buffer: Buffer;
  fileName: string;
}) => Promise<string[]>;

const execFileAsync = promisify(execFile);
const BAIDU_TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const BAIDU_OCR_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic';
const MAX_BAIDU_ENCODED_BYTES = 8 * 1024 * 1024;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

const compactText = (lines: string[]) => lines
  .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .join('\n')
  .slice(0, 160_000);

const getBaiduToken = async ({
  config,
  fetchImpl,
}: {
  config: LocalOCRConfig;
  fetchImpl: typeof fetch;
}) => {
  const apiKey = String(config.baiduApiKey || '').trim();
  const secretKey = String(config.baiduSecretKey || '').trim();
  if (!apiKey || !secretKey) throw new Error('百度 OCR 的 API Key 和 Secret Key 未配置');
  const cacheKey = `${apiKey}\u0000${secretKey}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const url = new URL(BAIDU_TOKEN_URL);
  url.searchParams.set('grant_type', 'client_credentials');
  url.searchParams.set('client_id', apiKey);
  url.searchParams.set('client_secret', secretKey);
  const response = await fetchImpl(url, { method: 'POST' });
  const body = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || `百度 OCR 鉴权失败 (${response.status})`);
  }
  tokenCache.set(cacheKey, {
    token: body.access_token,
    expiresAt: Date.now() + Math.max(60, Number(body.expires_in || 2_592_000)) * 1000,
  });
  return body.access_token;
};

const recognizeWithBaidu = async ({
  buffer,
  fileName,
  contentType,
  pageCount,
  config,
  fetchImpl,
}: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  pageCount: number;
  config: LocalOCRConfig;
  fetchImpl: typeof fetch;
}): Promise<OCRResult> => {
  const encoded = buffer.toString('base64');
  if (Buffer.byteLength(encoded, 'utf8') > MAX_BAIDU_ENCODED_BYTES) {
    throw new Error('文档超过百度 OCR 8MB 编码上限');
  }
  const token = await getBaiduToken({ config, fetchImpl });
  const isPdf = /\.pdf(?:$|[?#])|application\/pdf/i.test(`${fileName} ${contentType}`);
  const pages = isPdf ? Math.max(1, Math.min(pageCount || 1, 6)) : 1;
  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const form = new URLSearchParams();
    form.set(isPdf ? 'pdf_file' : 'image', encoded);
    if (isPdf) form.set('pdf_file_num', String(pageNumber));
    form.set('detect_direction', 'true');
    form.set('paragraph', 'false');
    const response = await fetchImpl(`${BAIDU_OCR_URL}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const body = await response.json() as {
      words_result?: Array<{ words?: string }>;
      error_msg?: string;
    };
    if (!response.ok || body.error_msg) {
      throw new Error(body.error_msg || `百度 OCR 识别失败 (${response.status})`);
    }
    lines.push(...(body.words_result || []).map((item) => item.words || ''));
  }
  return { provider: 'baidu', text: compactText(lines) };
};

const findJsonFiles = async (directory: string): Promise<string[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [fullPath] : [];
  }));
  return nested.flat();
};

const runPaddleCommand: PaddleRunner = async ({ command, args, buffer, fileName }) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hcz-paddle-ocr-'));
  const inputPath = path.join(root, `input${path.extname(fileName) || '.bin'}`);
  const outputPath = path.join(root, 'output');
  try {
    await fs.writeFile(inputPath, buffer);
    const expandedArgs = args.map((arg) => arg === '{input}' ? inputPath : arg === '{output}' ? outputPath : arg);
    await execFileAsync(command, expandedArgs, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    const files = await findJsonFiles(outputPath);
    const lines: string[] = [];
    for (const file of files) {
      const body = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
      const result = (body.res || body) as Record<string, unknown>;
      if (Array.isArray(result.rec_texts)) lines.push(...result.rec_texts.map(String));
      if (Array.isArray(body.rec_texts)) lines.push(...body.rec_texts.map(String));
    }
    return lines;
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
};

const recognizeWithPaddle = async ({
  buffer,
  fileName,
  config,
  runPaddle,
}: {
  buffer: Buffer;
  fileName: string;
  config: LocalOCRConfig;
  runPaddle: PaddleRunner;
}): Promise<OCRResult> => {
  const command = String(config.paddleCommand || '').trim();
  if (!command) throw new Error('PaddleOCR 命令路径未配置');
  const args = ['ocr', '-i', '{input}'];
  if (config.paddleConfigPath) args.push('--paddlex_config', config.paddleConfigPath);
  if (config.paddleDevice) args.push('--device', config.paddleDevice);
  args.push('--save_path', '{output}');
  const lines = await runPaddle({ command, args, buffer, fileName });
  return { provider: 'paddle', text: compactText(lines) };
};

export const recognizeDocumentWithOCR = async ({
  buffer,
  fileName = 'document.bin',
  contentType = '',
  pageCount = 1,
  config,
  fetchImpl = fetch,
  runPaddle = runPaddleCommand,
}: {
  buffer: Buffer;
  fileName?: string;
  contentType?: string;
  pageCount?: number;
  config?: LocalOCRConfig | null;
  fetchImpl?: typeof fetch;
  runPaddle?: PaddleRunner;
}): Promise<OCRResult> => {
  if (!config || config.enabled === false || !config.provider || config.provider === 'disabled') {
    throw new Error('OCR 未启用');
  }
  if (config.provider === 'baidu') {
    return recognizeWithBaidu({ buffer, fileName, contentType, pageCount, config, fetchImpl });
  }
  return recognizeWithPaddle({ buffer, fileName, config, runPaddle });
};

export const testOCRConfig = async ({
  config,
  fetchImpl = fetch,
}: {
  config?: LocalOCRConfig | null;
  fetchImpl?: typeof fetch;
}) => {
  try {
    if (!config || config.enabled === false || !config.provider || config.provider === 'disabled') {
      return { ok: false, provider: 'disabled', message: 'OCR 尚未启用' };
    }
    if (config.provider === 'baidu') await getBaiduToken({ config, fetchImpl });
    if (config.provider === 'paddle') {
      const command = String(config.paddleCommand || '').trim();
      if (!command) throw new Error('PaddleOCR 命令路径未配置');
      await execFileAsync(command, ['--version'], { timeout: 15_000, maxBuffer: 1024 * 1024 });
    }
    return { ok: true, provider: config.provider, message: `${config.provider === 'baidu' ? '百度 OCR' : 'PaddleOCR'} 配置可用` };
  } catch (error) {
    return {
      ok: false,
      provider: config?.provider || 'disabled',
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
