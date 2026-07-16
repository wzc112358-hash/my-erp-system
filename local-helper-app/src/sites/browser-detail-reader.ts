import type {
  BrowserObservation,
  BrowserSession,
  CandidateBundle,
  LocalHelperTask,
  TenderCandidate,
} from '../browser/types.ts';
import {
  formatDocumentEvidence,
  hasUsableDocumentText,
  readDocumentsFromObservation,
  type DocumentReadResult,
} from '../browser/document-reader.ts';
import type { LocalOCRConfig } from '../browser/ocr.ts';
import { analyzeObservation } from '../browser/extraction.ts';
import type { SiteDefinition } from './registry.ts';

const normalizedTitle = (value = '') => value.replace(/\s+/g, '').replace(/[（）()【】\[\]]/g, '').trim();

const findListItem = (observation: BrowserObservation, candidate: TenderCandidate) => {
  const expected = normalizedTitle(candidate.title);
  return (observation.listItems || []).find((item) => {
    const actual = normalizedTitle(item.title);
    return actual === expected || actual.includes(expected) || expected.includes(actual);
  });
};

const distinct = (values: string[]) => values.filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);

export const readRelevantBrowserDetails = async ({
  task,
  browser,
  definition,
  bundle,
  relevantIndexes,
  ocrConfig = null,
  documentReader = readDocumentsFromObservation,
}: {
  task: LocalHelperTask;
  browser: BrowserSession;
  definition: SiteDefinition;
  bundle: CandidateBundle;
  relevantIndexes: number[];
  ocrConfig?: LocalOCRConfig | null;
  documentReader?: typeof readDocumentsFromObservation;
}): Promise<{
  status: 'ready' | 'request_human';
  reason: string;
  observation?: BrowserObservation;
  bundle: CandidateBundle;
  documentsByIndex: Map<number, DocumentReadResult[]>;
}> => {
  const documentsByIndex = new Map<number, DocumentReadResult[]>();
  const candidates = bundle.candidates.map((candidate) => ({ ...candidate }));
  if (!browser.act) return { status: 'ready', reason: '', bundle: { ...bundle, candidates }, documentsByIndex };

  for (const index of relevantIndexes.slice(0, definition.browserJourney?.maxDetails || 6)) {
    const candidate = candidates[index];
    if (!candidate || candidate.raw_text.includes('【公告详情】')) continue;
    let list = await browser.open(task.entryUrl || definition.entryUrl || '');
    if (candidate.search_query) {
      const searched = await browser.act({ type: 'search', query: candidate.search_query });
      list = searched.observation;
    }
    const listItem = findListItem(list, candidate);
    let detail: BrowserObservation;
    const directUrl = listItem?.url || (candidate.url !== list.url ? candidate.url : '');
    if (directUrl) {
      detail = (await browser.act({ type: 'navigate', url: directUrl })).observation;
    } else {
      const elementId = listItem?.elementId || candidate.browser_ref || '';
      const opened = elementId
        ? await browser.act({ type: 'click', elementId })
        : await browser.act({ type: 'click_first_notice' });
      detail = opened.observation;
    }
    const analysis = analyzeObservation(detail, definition);
    const directDocument = /\.(?:pdf|docx?)(?:[?#]|$)/i.test(detail.url || '');
    if (detail.humanChallengeVisible || (!directDocument && analysis.status === 'request_human')) {
      return {
        status: 'request_human',
        reason: '相关公告详情需要登录或安全验证，请完成后点击“继续采集”。',
        observation: detail,
        bundle: { ...bundle, candidates },
        documentsByIndex,
      };
    }
    let read = await browser.act({ type: 'read_document' });
    detail = read.observation;
    if (!detail.document) {
      await browser.act({ type: 'wait', milliseconds: 700 });
      read = await browser.act({ type: 'read_document' });
      detail = read.observation;
    }
    let documents = await documentReader({ observation: detail, maxDocuments: 2, ocrConfig });
    if (!documents.some((document) => hasUsableDocumentText(document.text)) &&
      ocrConfig?.enabled !== false && ocrConfig?.provider !== 'disabled' && browser.screenshot) {
      const screenshotPath = await browser.screenshot().catch(() => '');
      if (screenshotPath) {
        const screenshotDocuments = await documentReader({
          observation: { ...detail, document: undefined, links: [], downloadedFiles: [screenshotPath] },
          maxDocuments: 1,
          ocrConfig,
        });
        documents = [...documents, ...screenshotDocuments];
      }
    }
    documentsByIndex.set(index, documents);
    const usable = documents.filter((document) => hasUsableDocumentText(document.text));
    const detailText = detail.document?.text || detail.visibleText || '';
    if (usable.length || hasUsableDocumentText(detailText)) {
      candidates[index] = {
        ...candidate,
        url: detail.url || candidate.url,
        buyer_name: detail.document?.buyerName || candidate.buyer_name,
        published_at: detail.document?.publishedAt || candidate.published_at,
        raw_text: [
          '【公告详情】',
          formatDocumentEvidence(usable),
          hasUsableDocumentText(detailText) ? detailText.slice(0, 20_000) : '',
          candidate.raw_text,
        ].filter(Boolean).join('\n\n').slice(0, 30_000),
        attachments: distinct([
          ...candidate.attachments,
          ...usable.map((document) => document.url || ''),
          ...(detail.document?.attachmentUrls || []),
        ]),
      };
    }
  }
  return { status: 'ready', reason: '', bundle: { ...bundle, candidates }, documentsByIndex };
};
