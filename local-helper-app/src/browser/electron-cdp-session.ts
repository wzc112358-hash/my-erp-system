import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  BrowserAction,
  BrowserActionResult,
  BrowserInteractiveElement,
  BrowserLink,
  BrowserListItem,
  BrowserNetworkResponse,
  BrowserObservation,
  BrowserSession,
} from './types.ts';

type DebuggerLike = {
  attach(protocolVersion?: string): void;
  isAttached(): boolean;
  detach(): void;
  on(event: 'message' | 'detach', listener: (...args: any[]) => void): void;
  sendCommand(method: string, commandParams?: Record<string, unknown>, sessionId?: string): Promise<any>;
};

type WebContentsLike = {
  debugger: DebuggerLike;
  loadURL(url: string, options?: Record<string, unknown>): Promise<void>;
  getURL(): string;
  getTitle(): string;
  executeJavaScript<T>(code: string, userGesture?: boolean): Promise<T>;
  capturePage(): Promise<{ toPNG(): Buffer }>;
  canGoBack?(): boolean;
  goBack?(): void;
  getOwnerBrowserWindow?(): BrowserWindowLike | null;
  on?(event: 'did-create-window', listener: (_event: unknown, webContents: WebContentsLike) => void): void;
};

type BrowserWindowLike = {
  webContents: WebContentsLike;
  isDestroyed(): boolean;
  show(): void;
  focus(): void;
  close(): void;
  on(event: 'closed', listener: () => void): void;
};

export type ElectronCdpSessionOptions = {
  createWindow: () => BrowserWindowLike | any;
  screenshotDir: string;
  rewriteRequestUrl?: (url: string) => string;
  settleTimeoutMs?: number;
  cdpCommandTimeoutMs?: number;
  navigationTimeoutMs?: number;
  observationTimeoutMs?: number;
  documentTimeoutMs?: number;
};

const MAX_NETWORK_RESPONSES = 16;
const MAX_RESPONSE_BODY = 24_000;
const MAX_LINKS = 120;
const INTEREST_PATTERN = /招标|采购|询价|询比|竞价|谈判|公告|notice|bid|tender|bulletin|query|search|page|list/i;
// A page can load captcha SDK JavaScript during every normal visit. Treat only
// blocking response evidence as a challenge; the visible widget is detected
// separately from page text/DOM.
const CHALLENGE_PATTERN = /sigchl|punish-type|安全验证|访问验证|traceid|访问过于频繁/i;
const SAFE_RESPONSE_HEADERS = new Set(['content-type', 'punish-type', 'location', 'retry-after']);

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const settleWithin = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> => {
  if (timeoutMs <= 0) return promise.catch(() => undefined);
  let timeout: ReturnType<typeof setTimeout> | number | undefined;
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<undefined>((resolve) => {
      timeout = setTimeout(resolve, timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
};
const trim = (value = '', limit = MAX_RESPONSE_BODY) => value.length > limit
  ? `${value.slice(0, limit)}\n...[truncated]`
  : value;
const normalizeHeaders = (headers: Record<string, unknown> = {}) => Object.fromEntries(
  Object.entries(headers)
    .filter(([name]) => SAFE_RESPONSE_HEADERS.has(name.toLowerCase()))
    .map(([name, value]) => [name.toLowerCase(), String(value || '')]),
);

export const PAGE_OBSERVATION_SCRIPT = `(() => {
  // HCZ_PAGE_OBSERVATION: shared employee-browser observation.
  const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const visible = (element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
  };
  const interactiveNodes = Array.from(document.querySelectorAll(
    'a, button, input, textarea, select, [role="button"], [role="link"], .left_body_name, .indbody_arr, .box_data.cursor_style'
  )).filter(visible).slice(0, 200);
  const interactiveElements = interactiveNodes.map((element, index) => {
    const id = 'hcz-' + index;
    element.setAttribute('data-hcz-agent-id', id);
    return {
      id,
      role: element.getAttribute('role') || element.tagName.toLowerCase(),
      text: clean(element.innerText || element.textContent || element.getAttribute('aria-label')),
      value: 'value' in element ? clean(element.value) : '',
      placeholder: clean(element.getAttribute('placeholder'))
    };
  });
  const noticeCopy = /招标公告|采购公告|询价公告|询比采购|竞价采购|谈判采购|采购项目|招标项目|采购邀请/;
  const resultCopy = /候选人|中标|成交结果|评标结果|采购结果|结果公示|招标计划/;
  const domListItems = interactiveNodes.flatMap((element) => {
    const ownText = clean(element.innerText || element.textContent || element.getAttribute('aria-label'));
    let holder = element;
    let rawBlock = String(element.innerText || element.textContent || element.getAttribute('aria-label') || '');
    const card = element.closest('.show-item, .notice-item, .list-item, .notice-list-item, li, tr');
    if (card) {
      const cardBlock = String(card.innerText || card.textContent || '');
      if (noticeCopy.test(clean(cardBlock)) && cardBlock.length <= 6000) {
        holder = card;
        rawBlock = cardBlock;
      }
    }
    if (!card && !noticeCopy.test(ownText) && /^(查看详情|立即查看|查看|详情)$/.test(ownText)) {
      for (let depth = 0; depth < 4 && holder.parentElement; depth += 1) {
        holder = holder.parentElement;
        const parentBlock = String(holder.innerText || holder.textContent || '');
        if (noticeCopy.test(clean(parentBlock))) { rawBlock = parentBlock; break; }
      }
    }
    const rawText = clean(rawBlock);
    if (!noticeCopy.test(rawText) || resultCopy.test(rawText)) return [];
    const lines = rawBlock.split(/\\n+/).map(clean).filter(Boolean);
    const title = lines.find((line) => noticeCopy.test(line) && line.length >= 8 && line.length <= 240) || lines[0] || '';
    if (!title) return [];
    const publishedAt = rawText.match(/(?:发布时间|发布日期|公告时间)[:：]?\\s*(20\\d{2}[-/.年]\\d{1,2}[-/.月]\\d{1,2})/)?.[1]
      || rawText.match(/20\\d{2}[-/.年]\\d{1,2}[-/.月]\\d{1,2}/)?.[0] || '';
    const deadlineAt = rawText.match(/(?:公告结束时间|截止时间|开标时间|报价截止)[:：]?\\s*(20\\d{2}[-/.年]\\d{1,2}[-/.月]\\d{1,2})/)?.[1] || '';
    const anchor = element.closest('a');
    return [{
      title,
      elementId: element.getAttribute('data-hcz-agent-id') || '',
      url: anchor?.href || (element.tagName === 'A' ? element.href : ''),
      publishedAt,
      deadlineAt,
      noticeType: title.match(/(?:招标公告|采购公告|询价公告|询比采购|竞价采购|谈判采购)/)?.[0] || '',
      rawText: rawText.slice(0, 3000)
    }];
  }).filter((item, index, all) => index === all.findIndex((other) => other.title === item.title));
  const challengeElements = Array.from(document.querySelectorAll(
    '#captcha, .vaptcha, [class*="vaptcha"], [class*="yidun"], [class*="captcha"], iframe[src*="vaptcha"], iframe[src*="dun.163"]'
  )).filter(visible);
  const challengeCopy = /安全验证|滑块|验证码|网易易盾|VAPTCHA|请完成验证|请绘制|请依次点击|向右滑动|not a robot/i;
  const humanChallengeVisible = challengeElements.some((element) => {
    if (element.tagName === 'IFRAME') return true;
    return challengeCopy.test(clean(element.innerText || element.textContent || element.getAttribute('aria-label')));
  });
  const roots = Array.from(document.querySelectorAll('*')).slice(0, 3000)
    .map((element) => element.__vue__).filter(Boolean);
  const queue = roots.slice();
  const seen = new Set();
  let state = null;
  while (queue.length && !state) {
    const vm = queue.shift();
    if (!vm || seen.has(vm)) continue;
    seen.add(vm);
    if (Array.isArray(vm.arr_datas)
      && vm.addvalue
      && typeof vm.addvalue.inpvalue === 'string'
      && typeof vm.pageEvent === 'function'
      && typeof vm.addlist === 'function') state = vm;
    if (Array.isArray(vm.$children)) queue.push(...vm.$children);
  }
  const searchQuery = clean(state?.addvalue?.inpvalue || document.querySelector('input')?.value || '');
  const cleanMarkup = (value) => {
    const holder = document.createElement('div');
    holder.innerHTML = String(value || '');
    return clean(holder.textContent || holder.innerText || '');
  };
  const rows = Array.isArray(state?.arr_datas) ? state.arr_datas.slice(0, 100).map((row) => {
    const bulletinID = row.bulletinID || row.bulletinId || '';
    const dataSource = row.dataSource ?? '';
    const detailUrl = bulletinID
      ? location.origin + '/#/bulletinDetail?uuid=' + encodeURIComponent(bulletinID)
        + '&inpvalue=' + encodeURIComponent(searchQuery)
        + (dataSource === '' ? '' : '&dataSource=' + encodeURIComponent(dataSource))
      : '';
    return {
      noticeName: cleanMarkup(row.noticeName || row.bulletinName || row.title),
      noticeSendTime: clean(row.noticeSendTime || row.publishTime || row.publishDate),
      bulletinTypeName: clean(row.bulletinTypeName || row.noticeTypeName || row.bulletinType),
      bulletinSource: clean(row.bulletinSource),
      buyerName: clean(row.tenderName || row.buyerName || row.bulletinSource),
      tenderAgency: clean(row.tenderAgency),
      bulletinID: clean(bulletinID),
      dataSource,
      url: detailUrl
    };
  }).filter((row) => row.noticeName) : [];
  const noticeTypeValue = Number(state?.types);
  return {
    title: document.title || '',
    url: location.href,
    visibleText: (document.body?.innerText || '').slice(0, 120000),
    links: Array.from(document.querySelectorAll('a')).slice(0, ${MAX_LINKS}).map((anchor) => ({
      text: clean(anchor.innerText || anchor.textContent),
      href: anchor.href || anchor.getAttribute('href') || '',
      title: anchor.title || anchor.getAttribute('title') || ''
    })),
    interactiveElements,
    listItems: [
      ...rows.map((row) => ({
        title: row.noticeName,
        url: row.url,
        publishedAt: row.noticeSendTime,
        buyerName: row.buyerName,
        noticeType: row.bulletinTypeName,
        rawText: [row.noticeName, row.noticeSendTime, row.bulletinTypeName, row.buyerName].filter(Boolean).join(' ')
      })),
      ...domListItems
    ].filter((item, index, all) => index === all.findIndex((other) => other.title === item.title)),
    searchQuery,
    currentPage: Number(state?.currentpage || 0),
    totalPages: Number(state?.pageCount || state?.totalPage || 0),
    noticeType: Number.isFinite(noticeTypeValue) ? noticeTypeValue : undefined,
    noticeTypes: Array.from(new Set(rows.map((row) => row.bulletinTypeName).filter(Boolean))),
    searchReady: Boolean(state && searchQuery),
    humanChallengeVisible,
    structuredRows: rows
  };
})()`;

export const CLICK_FIRST_NOTICE_SCRIPT = `(() => {
  const direct = document.querySelector('.left_body_name, .indbody_arr');
  if (direct) {
    const text = String(direct.innerText || direct.textContent || '').replace(/\\s+/g, ' ').trim();
    direct.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return { performed: true, detail: text };
  }
  const candidates = Array.from(document.querySelectorAll('a, p, div, li, span')).filter((element) => {
    const text = String(element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text.length < 10 || text.length > 180 || !/(招标|采购|询比|询价|竞价).{0,20}(公告|项目)|(?:公告|项目).{0,20}(招标|采购)/.test(text)) return false;
    if (/搜索引擎|发布工具|增值服务|中标业绩|企业产品专区/.test(text)) return false;
    return !Array.from(element.children).some((child) => String(child.innerText || '').trim() === text);
  });
  const target = candidates[0];
  if (!target) return { performed: false, detail: 'no notice element' };
  const clickable = target.closest('a, button, [role="link"], [role="button"], .left_body, .indbody_arr') || target;
  clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return { performed: true, detail: String(target.innerText || target.textContent || '').trim() };
})()`;

export const SEARCH_SCRIPT = (query: string) => `(() => {
  const query = ${JSON.stringify(query)};
  const roots = Array.from(document.querySelectorAll('*')).slice(0, 3000)
    .map((element) => element.__vue__).filter(Boolean);
  const queue = roots.slice();
  const seen = new Set();
  while (queue.length) {
    const vm = queue.shift();
    if (!vm || seen.has(vm)) continue;
    seen.add(vm);
    if (Array.isArray(vm.arr_datas)
      && vm.addvalue
      && typeof vm.addvalue.inpvalue === 'string'
      && typeof vm.addlist === 'function') {
      vm.types = 0;
      if ('gglx' in vm) vm.gglx = 1;
      vm.addvalue.inpvalue = query;
      if ('currentpage' in vm) vm.currentpage = 1;
      vm.addlist();
      return { performed: true, detail: 'vue search tender announcements' };
    }
    if (Array.isArray(vm.$children)) queue.push(...vm.$children);
  }
  const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
  const input = inputs.find((item) => item.closest('.search, .search_input, .search-box, .el-input')) || inputs[0];
  if (!input) return { performed: false, detail: 'search input missing' };
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, query); else input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const button = Array.from(document.querySelectorAll(
    'button, [role="button"], .el-input-group__append span, .el-input-group__append, .search-btn, .search-button, [class*="search-btn"]'
  ))
    .filter((item) => String(item.innerText || item.textContent || '').replace(/\\s+/g, '').trim() === '搜索')
    .sort((left, right) => left.children.length - right.children.length)[0];
  if (button) button.click();
  else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  return { performed: true, detail: button ? 'search button' : 'enter' };
})()`;

export const READ_DOCUMENT_SCRIPT = `(async () => {
  // HCZ_READ_DOCUMENT: stable marker for the CDP detail-reading action.
  const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const roots = Array.from(document.querySelectorAll('*')).slice(0, 4000)
    .map((element) => element.__vue__).filter(Boolean);
  const queue = roots.slice();
  const seen = new Set();
  let state = null;
  while (queue.length && !state) {
    const vm = queue.shift();
    if (!vm || seen.has(vm)) continue;
    seen.add(vm);
    const hasDetailRecord = vm.indbody_arr && typeof vm.indbody_arr === 'object' && !Array.isArray(vm.indbody_arr);
    const hasDocumentUrl = /(?:\.pdf(?:[?#]|$)|viewer\.html|blob:)/i.test(clean(vm.pdfUrl));
    if (hasDetailRecord || hasDocumentUrl) state = vm;
    if (Array.isArray(vm.$children)) queue.push(...vm.$children);
  }
  const record = state?.indbody_arr && !Array.isArray(state.indbody_arr) ? state.indbody_arr : {};
  const first = (...values) => values.map(clean).find(Boolean) || '';
  const hashQuery = location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?') + 1) : '';
  const hashParams = new URLSearchParams(hashQuery);
  const viewerUrl = first(
    state?.pdfUrl, record.pdfUrl, record.pdfURL, record.fileUrl,
    hashParams.get('pdfUrl'), hashParams.get('file'),
    /\.pdf(?:[?#]|$)/i.test(location.href) ? location.href : ''
  );
  let pdfUrl = '';
  if (viewerUrl) {
    try {
      const parsed = new URL(viewerUrl, location.href);
      pdfUrl = parsed.searchParams.get('file') || viewerUrl;
      try { pdfUrl = decodeURIComponent(pdfUrl); } catch {}
      pdfUrl = new URL(pdfUrl, location.href).toString();
    } catch { pdfUrl = viewerUrl; }
  }
  const domAttachmentUrls = Array.from(document.querySelectorAll('a[href]'))
    .filter((anchor) => /附件|下载|招标文件|采购文件|\.pdf|\.docx?|\.xlsx?/i.test(
      String(anchor.innerText || anchor.textContent || '') + ' ' + String(anchor.href || '')
    ))
    .map((anchor) => anchor.href);
  const attachmentValues = [
    record.AnnexUrl, record.annexUrl, record.attachmentUrl, record.attachmentUrls,
    record.attachments, state?.AnnexUrl, state?.attachmentUrls, domAttachmentUrls
  ].flatMap((value) => Array.isArray(value) ? value : value ? [value] : []);
  const attachmentUrls = attachmentValues.flatMap((value) => {
    if (value && typeof value === 'object') {
      return [value.url, value.fileUrl, value.downloadUrl].filter(Boolean);
    }
    return String(value).split(/[,;\\n]/).map((item) => item.trim()).filter(Boolean);
  }).map((value) => {
    try { return new URL(String(value), location.href).toString(); } catch { return String(value); }
  });
  let text = '';
  let pageCount = 0;
  const frames = Array.from(document.querySelectorAll('iframe'));
  for (const frame of frames) {
    try {
      const app = frame.contentWindow?.PDFViewerApplication;
      const pdf = app?.pdfDocument;
      if (!pdf) continue;
      pageCount = Number(pdf.numPages || 0);
      const pageTexts = [];
      for (let pageNumber = 1; pageNumber <= Math.min(pageCount, 40); pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pageTexts.push((content.items || []).map((item) => item.str || '').join(' '));
      }
      text = pageTexts.join('\\n').trim();
      if (text) break;
    } catch {}
  }
  if (!text) {
    const detailRoot = document.querySelector('main, article, .article, .detail, .content') || document.body;
    const visibleDetail = String(detailRoot?.innerText || '').replace(/\\n{3,}/g, '\\n\\n').trim();
    if (visibleDetail.length >= 500 && /招标条件|采购范围|资格要求|投标人|供应商|截止时间|响应文件/.test(visibleDetail)) {
      text = visibleDetail;
    }
  }
  const visibleTitle = Array.from(document.querySelectorAll('h1, h2, .title, .contentTitle, .breadcrumb a'))
    .map((element) => clean(element.innerText || element.textContent))
    .filter((value) => value.length >= 8 && /招标|采购|询价|询比|竞价|谈判/.test(value))
    .sort((left, right) => right.length - left.length)[0] || '';
  return {
    title: first(record.noticeName, record.bulletinName, record.title, visibleTitle, document.title),
    noticeType: first(record.bulletinTypeName, record.noticeTypeName, record.bulletinType),
    publishedAt: first(record.noticeSendTime, record.publishTime, record.publishDate),
    buyerName: first(record.tenderName, record.buyerName, record.bulletinSource),
    pdfUrl,
    attachmentUrls: Array.from(new Set(attachmentUrls)),
    text: text.slice(0, 160000),
    pageCount
  };
})()`;

export const NEXT_PAGE_SCRIPT = `(() => {
  const roots = Array.from(document.querySelectorAll('*')).slice(0, 3000)
    .map((element) => element.__vue__).filter(Boolean);
  const queue = roots.slice();
  const seen = new Set();
  while (queue.length) {
    const vm = queue.shift();
    if (!vm || seen.has(vm)) continue;
    seen.add(vm);
    if (Array.isArray(vm.arr_datas)
      && vm.addvalue
      && typeof vm.pageEvent === 'function'
      && typeof vm.addlist === 'function') {
      const current = Number(vm.currentpage || 1);
      const total = Number(vm.pageCount || vm.totalPage || 0);
      if (total && current >= total) return { performed: false, detail: 'last page' };
      vm.pageEvent(current + 1);
      return { performed: true, detail: 'vue pageEvent ' + (current + 1) };
    }
    if (Array.isArray(vm.$children)) queue.push(...vm.$children);
  }
  const selectors = [
    '.el-pagination .btn-next:not([disabled])',
    '.ant-pagination-next:not(.ant-pagination-disabled) button',
    '.ant-pagination-next:not(.ant-pagination-disabled) a',
    '[aria-label="下一页"]:not([disabled])',
    '.pagination .next:not(.disabled)'
  ];
  let target = selectors.map((selector) => document.querySelector(selector)).find(Boolean);
  if (!target) target = Array.from(document.querySelectorAll('button, a, li')).find((element) => {
    const text = String(element.innerText || element.textContent || '').replace(/\\s+/g, '').trim();
    return /^(下一页|下页|›|>)$/.test(text) && !element.disabled && !element.classList.contains('disabled');
  });
  if (!target) return { performed: false, detail: 'next page missing' };
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return { performed: true, detail: 'next page' };
})()`;

export const createElectronCdpSession = ({
  createWindow,
  screenshotDir,
  rewriteRequestUrl,
  settleTimeoutMs = 800,
  cdpCommandTimeoutMs = 1_500,
  navigationTimeoutMs = 12_000,
  observationTimeoutMs = 2_000,
  documentTimeoutMs = 20_000,
}: ElectronCdpSessionOptions): BrowserSession => {
  let window: BrowserWindowLike | null = null;
  let windowPromise: Promise<BrowserWindowLike> | null = null;
  let debuggerReady: Promise<void> | null = null;
  const windows = new Set<BrowserWindowLike>();
  const networkResponses: BrowserNetworkResponse[] = [];
  const pendingResponses = new Map<string, BrowserNetworkResponse>();

  const pushResponse = (response: BrowserNetworkResponse) => {
    networkResponses.push(response);
    if (networkResponses.length > MAX_NETWORK_RESPONSES) {
      networkResponses.splice(0, networkResponses.length - MAX_NETWORK_RESPONSES);
    }
  };

  const clearNetworkEvidence = () => {
    networkResponses.length = 0;
    pendingResponses.clear();
  };

  const wireDebugger = async (target: BrowserWindowLike) => {
    const cdp = target.webContents.debugger;
    if (!cdp.isAttached()) cdp.attach('1.3');
    cdp.on('message', (_event, method: string, params: any) => {
      if (method === 'Fetch.requestPaused') {
        const requestId = String(params?.requestId || '');
        const originalUrl = String(params?.request?.url || '');
        const rewrittenUrl = rewriteRequestUrl?.(originalUrl) || originalUrl;
        const continueParams = rewrittenUrl !== originalUrl
          ? { requestId, url: rewrittenUrl }
          : { requestId };
        void cdp.sendCommand('Fetch.continueRequest', continueParams).catch(() => undefined);
        return;
      }
      if (method === 'Network.responseReceived') {
        const url = String(params?.response?.url || '');
        const mimeType = String(params?.response?.mimeType || '');
        if (!INTEREST_PATTERN.test(`${url} ${mimeType}`)) return;
        const responseHeaders = normalizeHeaders(params?.response?.headers || {});
        pendingResponses.set(String(params.requestId || ''), {
          url,
          status: Number(params?.response?.status || 0),
          contentType: responseHeaders['content-type'] || mimeType,
          responseHeaders,
          bodySnippet: '',
          challenge: CHALLENGE_PATTERN.test(`${url} ${JSON.stringify(responseHeaders)}`),
        });
      }
      if (method === 'Network.loadingFinished') {
        const requestId = String(params?.requestId || '');
        const response = pendingResponses.get(requestId);
        if (!response) return;
        pendingResponses.delete(requestId);
        void cdp.sendCommand('Network.getResponseBody', { requestId }).then((body) => {
          const decoded = body?.base64Encoded
            ? Buffer.from(String(body.body || ''), 'base64').toString('utf8')
            : String(body?.body || '');
          const bodySnippet = trim(decoded);
          pushResponse({
            ...response,
            bodySnippet,
            challenge: Boolean(response.challenge) || CHALLENGE_PATTERN.test(bodySnippet.slice(0, 1200)),
          });
        }).catch(() => pushResponse(response));
      }
    });
    cdp.on('detach', () => {
      pendingResponses.clear();
    });
    await cdp.sendCommand('Network.enable', {
      maxTotalBufferSize: 2_000_000,
      maxResourceBufferSize: 300_000,
    });
    if (rewriteRequestUrl) {
      await cdp.sendCommand('Fetch.enable', {
        patterns: [{ urlPattern: '*cutominfoapi/searchkeyword*', requestStage: 'Request' }],
      });
    }
  };

  const registerWindow = (created: BrowserWindowLike) => {
    windows.add(created);
    window = created;
    created.on('closed', () => {
      windows.delete(created);
      if (window === created) {
        const fallback = [...windows].reverse().find((candidate) => !candidate.isDestroyed()) || null;
        window = fallback;
        windowPromise = fallback ? Promise.resolve(fallback) : null;
        debuggerReady = Promise.resolve();
      }
    });
    created.webContents.on?.('did-create-window', (_event, childContents) => {
      const childWindow = childContents.getOwnerBrowserWindow?.();
      if (childWindow && !childWindow.isDestroyed()) registerWindow(childWindow);
    });
    created.show();
    created.focus();
    debuggerReady = settleWithin(wireDebugger(created), cdpCommandTimeoutMs).then(() => undefined);
    return created;
  };

  const getWindow = async () => {
    if (window && !window.isDestroyed()) {
      window.show();
      window.focus();
      return window;
    }
    if (!windowPromise) {
      windowPromise = (async () => {
        const created = createWindow();
        // A hidden, never-navigated WebContents can leave Network.enable
        // pending indefinitely on Windows. Make the employee window visible
        // first, then let navigation create the renderer while CDP attaches.
        return registerWindow(created);
      })();
    }
    return windowPromise;
  };

  const observeWindow = async (target: BrowserWindowLike): Promise<BrowserObservation> => {
    const evaluated = target.webContents.executeJavaScript<{
      title: string;
      url: string;
      visibleText: string;
      links: BrowserLink[];
      interactiveElements: BrowserInteractiveElement[];
      listItems: BrowserListItem[];
      searchQuery: string;
      currentPage: number;
      totalPages: number;
      noticeType?: number;
      noticeTypes?: string[];
      searchReady?: boolean;
      humanChallengeVisible: boolean;
      structuredRows: Record<string, unknown>[];
    }>(PAGE_OBSERVATION_SCRIPT, false);
    const page = await settleWithin(evaluated, observationTimeoutMs) || {
      title: target.webContents.getTitle(),
      url: target.webContents.getURL(),
      visibleText: '',
      links: [],
      interactiveElements: [],
      listItems: [],
      searchQuery: '',
      currentPage: 0,
      totalPages: 0,
      noticeTypes: [],
      searchReady: false,
      humanChallengeVisible: false,
      structuredRows: [],
    };
    const structuredRows = page.structuredRows || [];
    const structuredResponse: BrowserNetworkResponse[] = structuredRows.length
      ? [{
        url: `hcz://browser-state/yulong?page=${page.currentPage || 1}`,
        status: 200,
        contentType: 'application/json',
        bodySnippet: JSON.stringify({ dataList: structuredRows }),
        responseHeaders: { 'content-type': 'application/json' },
        challenge: false,
      }]
      : [];
    const { structuredRows: _structuredRows, ...observation } = page;
    return {
      ...observation,
      networkResponses: [...networkResponses, ...structuredResponse],
      downloadedFiles: [],
    };
  };

  const finishAction = async (
    target: BrowserWindowLike,
    performed: boolean,
    detail = '',
    delayMs = settleTimeoutMs,
  ): Promise<BrowserActionResult> => {
    if (delayMs > 0) await wait(delayMs);
    const active = window && !window.isDestroyed() ? window : target;
    return {
      performed,
      detail,
      observation: await observeWindow(active),
    };
  };

  return {
    engine: 'electron-cdp',
    async open(url: string) {
      const target = await getWindow();
      clearNetworkEvidence();
      await debuggerReady;
      const navigation = settleWithin(target.webContents.loadURL(url), navigationTimeoutMs);
      await navigation;
      if (settleTimeoutMs > 0) await wait(settleTimeoutMs);
      return observeWindow(target);
    },
    async observe() {
      const target = await getWindow();
      await debuggerReady;
      if (settleTimeoutMs > 0) await wait(Math.min(350, settleTimeoutMs));
      return observeWindow(target);
    },
    async act(action: BrowserAction) {
      const target = await getWindow();
      if (action.type !== 'wait') clearNetworkEvidence();
      if (action.type === 'navigate') {
        await settleWithin(target.webContents.loadURL(action.url), navigationTimeoutMs);
        return finishAction(target, true, action.url);
      }
      if (action.type === 'back') {
        const performed = Boolean(target.webContents.canGoBack?.());
        if (performed) target.webContents.goBack?.();
        return finishAction(target, performed, performed ? 'back' : 'no history');
      }
      if (action.type === 'wait') {
        return finishAction(target, true, 'wait', Math.max(0, Math.min(action.milliseconds, 5_000)));
      }
      if (action.type === 'read_document') {
        const document = await settleWithin(target.webContents.executeJavaScript<BrowserObservation['document']>(
          READ_DOCUMENT_SCRIPT,
          false,
        ), documentTimeoutMs);
        const observation = await observeWindow(window && !window.isDestroyed() ? window : target);
        return {
          performed: Boolean(document),
          detail: document ? 'document read' : 'document unavailable',
          observation: document ? { ...observation, document } : observation,
        };
      }
      const script = action.type === 'click'
        ? `(() => {
          const target = document.querySelector('[data-hcz-agent-id="${action.elementId.replace(/[^a-zA-Z0-9_-]/g, '')}"]');
          if (!target) return { performed: false, detail: 'element missing' };
          target.click();
          return { performed: true, detail: String(target.innerText || target.textContent || '').trim() };
        })()`
        : action.type === 'click_first_notice'
          ? CLICK_FIRST_NOTICE_SCRIPT
          : action.type === 'search'
            ? SEARCH_SCRIPT(action.query)
            : NEXT_PAGE_SCRIPT;
      const executed = await settleWithin(target.webContents.executeJavaScript<{
        performed?: boolean;
        detail?: string;
      }>(script, true), observationTimeoutMs);
      if (action.type !== 'next_page' || !executed?.performed) {
        return finishAction(target, Boolean(executed?.performed), executed?.detail || '');
      }
      let nextResult = await finishAction(target, true, executed.detail || '', 600);
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const hasRows = (nextResult.observation.networkResponses || [])
          .some((response) => response.url.startsWith('hcz://browser-state/yulong'));
        const visibleChallenge = Boolean(nextResult.observation.humanChallengeVisible) ||
          /安全验证|滑块|验证码|请完成验证|请依次点击|向右滑动/i.test(
          `${nextResult.observation.title}\n${nextResult.observation.visibleText}`,
        );
        if (hasRows || visibleChallenge) break;
        nextResult = await finishAction(target, true, executed.detail || '', 700);
      }
      return nextResult;
    },
    async screenshot() {
      const target = await getWindow();
      await fs.mkdir(screenshotDir, { recursive: true });
      const file = path.join(screenshotDir, `${Date.now()}-electron-cdp.png`);
      const image = await settleWithin(target.webContents.capturePage(), observationTimeoutMs);
      if (!image) return '';
      await fs.writeFile(file, image.toPNG());
      return file;
    },
    async close() {
      const currentWindows = [...windows];
      windows.clear();
      window = null;
      windowPromise = null;
      debuggerReady = null;
      for (const current of currentWindows.reverse()) {
        if (current.isDestroyed()) continue;
        const cdp = current.webContents.debugger;
        if (cdp.isAttached()) cdp.detach();
        current.close();
      }
    },
  };
};
