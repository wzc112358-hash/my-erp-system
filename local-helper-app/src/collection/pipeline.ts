import type {
  BrowserObservation,
  BrowserSession,
  CandidateBundle,
  LocalHelperArtifact,
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
import {
  analyzeObservation,
  buildObservationArtifacts,
  extractCandidateBundle,
} from '../browser/extraction.ts';
import {
  buildScreenedNotices,
  summarizeScreenedNotices,
  type ScreenedNotice,
  type ProductTerm,
} from '../domain/tender-screening.ts';
import {
  assessScreenedNotices,
  createDeterministicBidAssessor,
  type BidAssessor,
} from '../llm/bid-assessor.ts';
import { extractCandidatesWithLLM } from '../llm/candidate-extractor.ts';
import type { BrowserActionPlanner } from '../llm/browser-action-planner.ts';
import type { LocalLLMConfig } from '../llm/client.ts';
import {
  collectSitePublicFeed,
  type SitePublicFeedResult,
} from '../sites/public-collectors.ts';
import { definitionFor } from '../sites/registry.ts';
import { runYulongBrowserAgent } from '../sites/yulong-agent.ts';
import { runBrowserSearchJourney } from '../sites/browser-journey.ts';
import { readRelevantBrowserDetails } from '../sites/browser-detail-reader.ts';
import type { AgentHarnessStepInput } from './run-log.ts';

export type CollectionRunResult = {
  status: 'request_human' | 'completed' | 'failed';
  humanReason: string;
  observation?: BrowserObservation;
  candidateBundle: CandidateBundle | null;
  artifacts: LocalHelperArtifact[];
  resultSummary: string;
  discoveredLinks: Array<{ title: string; url: string }>;
  screenedNotices?: ScreenedNotice[];
};

export type CollectionRunOptions = {
  llmConfig?: LocalLLMConfig | null;
  assessor?: BidAssessor;
  terms?: ProductTerm[];
  resume?: boolean;
  recordStep?: (step: AgentHarnessStepInput) => Promise<void> | void;
  publicFeedCollector?: typeof collectSitePublicFeed;
  llmCandidateExtractor?: typeof extractCandidatesWithLLM;
  browserActionPlanner?: BrowserActionPlanner;
  ocrConfig?: LocalOCRConfig | null;
  documentReader?: typeof readDocumentsFromObservation;
};

const cleanCandidateTitle = (value = '') => value
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

const candidateKey = (candidate: TenderCandidate) => (
  `${cleanCandidateTitle(candidate.title).replace(/\s+/g, '')}|${candidate.url}`
);

const mergeBundles = (
  sourceName: string,
  ...bundles: Array<CandidateBundle | null | undefined>
): CandidateBundle | null => {
  const candidates = bundles
    .flatMap((bundle) => bundle?.candidates || [])
    .map((candidate) => ({ ...candidate, title: cleanCandidateTitle(candidate.title) }))
    .filter((candidate) => sourceName !== '裕龙招投标网' || /\/bulletinDetail\?uuid=/i.test(candidate.url));
  const unique = candidates.filter((candidate, index, all) => (
    index === all.findIndex((item) => candidateKey(item) === candidateKey(candidate))
  )).slice(0, 100);
  return unique.length ? { source_name: sourceName, candidates: unique } : null;
};

const summaryForBundle = (bundle: CandidateBundle | null) => {
  const candidates = bundle?.candidates || [];
  if (!candidates.length) return '未识别到招投标候选公告。';
  return [
    `识别到 ${candidates.length} 条候选公告：`,
    ...candidates.slice(0, 10).map((candidate, index) => `${index + 1}. ${candidate.title}`),
  ].join('\n');
};

const discoveredLinksFor = (
  observation: BrowserObservation | undefined,
  bundle: CandidateBundle | null,
) => {
  const links = [
    ...(bundle?.candidates || []).map((candidate) => ({ title: candidate.title, url: candidate.url })),
    ...(observation?.links || []).map((link) => ({ title: link.title || link.text || link.href, url: link.href })),
  ].filter((link) => link.url);
  return links.filter((link, index, all) => index === all.findIndex((item) => item.url === link.url)).slice(0, 30);
};

const hasActionableNotice = (cards: ScreenedNotice[]) => (
  cards.some((card) => card.recommendedAction !== 'ignore')
);

const finalizeCandidates = async ({
  task,
  bundle,
  observation,
  artifacts,
  assessor,
  terms,
  recordStep,
  assessedCards,
}: {
  task: LocalHelperTask;
  bundle: CandidateBundle;
  observation?: BrowserObservation;
  artifacts: LocalHelperArtifact[];
  assessor: BidAssessor;
  terms?: ProductTerm[];
  recordStep: (step: AgentHarnessStepInput) => Promise<void>;
  assessedCards?: ScreenedNotice[];
}): Promise<CollectionRunResult> => {
  const cards = assessedCards || await assessScreenedNotices({
      task,
      bundle,
      cards: buildScreenedNotices({ bundle, task, terms }),
      assessor,
    });
  await recordStep({
    phase: 'assess',
    action: 'assess_candidates',
    tool: assessor.name,
    result: {
      candidateCount: bundle.candidates.length,
      actionableCount: cards.filter((card) => card.recommendedAction !== 'ignore').length,
    },
  });

  const discoveredLinks = discoveredLinksFor(observation, bundle);
  if (!hasActionableNotice(cards)) {
    return {
      status: 'completed',
      humanReason: '',
      observation,
      candidateBundle: bundle,
      artifacts,
      resultSummary: `已巡检 ${bundle.candidates.length} 条公告，没有筛选出与公司产品相关的当前采购信息。`,
      discoveredLinks,
      screenedNotices: cards,
    };
  }

  const resultSummary = summarizeScreenedNotices(cards, summaryForBundle(bundle));
  return {
    status: 'completed',
    humanReason: '',
    observation,
    candidateBundle: bundle,
    artifacts,
    resultSummary,
    discoveredLinks,
    screenedNotices: cards,
  };
};

const isYulongDetailPage = (observation?: BrowserObservation) => (
  /\/bulletinDetail(?:\?|$)/i.test(decodeURIComponent(observation?.url || ''))
);

const candidateUuid = (url = '') => {
  try {
    return new URL(url).searchParams.get('uuid') || '';
  } catch {
    return url.match(/[?&]uuid=([^&#]+)/i)?.[1] || '';
  }
};

const isNonRootDocumentUrl = (value = '') => {
  try {
    const url = new URL(value);
    return Boolean(url.protocol.startsWith('http') && url.pathname && url.pathname !== '/');
  } catch {
    return false;
  }
};

const enrichYulongDetails = async ({
  task,
  bundle,
  preliminaryCards,
  browser,
  resumeObservation,
  ocrConfig,
  documentReader,
  assessor,
  terms,
  recordStep,
}: {
  task: LocalHelperTask;
  bundle: CandidateBundle;
  preliminaryCards: ScreenedNotice[];
  browser: BrowserSession;
  resumeObservation?: BrowserObservation;
  ocrConfig?: LocalOCRConfig | null;
  documentReader: typeof readDocumentsFromObservation;
  assessor: BidAssessor;
  terms?: ProductTerm[];
  recordStep: (step: AgentHarnessStepInput) => Promise<void>;
}): Promise<{
  status: 'ready' | 'request_human';
  bundle: CandidateBundle;
  cards: ScreenedNotice[];
  observation?: BrowserObservation;
  documentsByIndex: Map<number, DocumentReadResult[]>;
  reason: string;
}> => {
  const documentsByIndex = new Map<number, DocumentReadResult[]>();
  if (!browser.act) {
    return { status: 'ready', bundle, cards: preliminaryCards, documentsByIndex, reason: '' };
  }
  const candidates = bundle.candidates.map((candidate) => ({ ...candidate }));
  const relevantIndexes = preliminaryCards
    .map((card, index) => card.recommendedAction !== 'ignore' ? index : -1)
    .filter((index) => index >= 0)
    .slice(0, 6);
  let pendingResume = resumeObservation;

  for (const index of relevantIndexes) {
    const candidate = candidates[index];
    if (!candidate) continue;
    if (candidate.raw_text.includes('【公告详情】')) continue;
    const resumeMatches = pendingResume && isYulongDetailPage(pendingResume) && (
      !candidateUuid(pendingResume.url) || candidateUuid(pendingResume.url) === candidateUuid(candidate.url)
    );
    let detail = resumeMatches
      ? pendingResume as BrowserObservation
      : (await browser.act({ type: 'navigate', url: candidate.url })).observation;
    if (resumeMatches) pendingResume = undefined;

    const detailAnalysis = analyzeObservation(detail, definitionFor(task.sourceName));
    if (detailAnalysis.status === 'request_human' || detail.humanChallengeVisible) {
      return {
        status: 'request_human',
        bundle: { ...bundle, candidates },
        cards: preliminaryCards,
        observation: detail,
        documentsByIndex,
        reason: '相关招标公告的详情验证页面已打开，请完成人机验证后点击“继续采集”。',
      };
    }

    let read = await browser.act({ type: 'read_document' });
    detail = read.observation;
    for (let attempt = 0; attempt < 3 && !detail.document; attempt += 1) {
      if (detail.humanChallengeVisible || analyzeObservation(detail, definitionFor(task.sourceName)).status === 'request_human') {
        return {
          status: 'request_human',
          bundle: { ...bundle, candidates },
          cards: preliminaryCards,
          observation: detail,
          documentsByIndex,
          reason: '读取招标公告详情时出现人机验证，请完成验证后点击“继续采集”。',
        };
      }
      await browser.act({ type: 'wait', milliseconds: 900 });
      read = await browser.act({ type: 'read_document' });
      detail = read.observation;
    }

    let documents = await documentReader({
      observation: detail,
      maxDocuments: 1,
      ocrConfig,
    });
    if (!documents.some((item) => hasUsableDocumentText(item.text)) &&
      ocrConfig?.enabled !== false && ocrConfig?.provider !== 'disabled' && browser.screenshot) {
      const screenshotPath = await browser.screenshot().catch(() => '');
      if (screenshotPath) {
        detail = { ...detail, screenshotPath };
        const screenshotDocuments = await documentReader({
          observation: {
            ...detail,
            document: undefined,
            links: [],
            downloadedFiles: [screenshotPath],
          },
          maxDocuments: 1,
          ocrConfig,
        });
        if (screenshotDocuments.some((item) => hasUsableDocumentText(item.text))) {
          documents = screenshotDocuments;
        } else {
          documents = [...documents, ...screenshotDocuments];
        }
      }
    }
    documentsByIndex.set(index, documents);
    const document = detail.document;
    const usableDocuments = documents.filter((item) => hasUsableDocumentText(item.text));
    const evidence = formatDocumentEvidence(usableDocuments);
    const detailReadSucceeded = usableDocuments.length > 0 || hasUsableDocumentText(document?.text || '');
    const detailMetadata = [
      detailReadSucceeded ? '【公告详情】' : '',
      document?.noticeType ? `公告类型：${document.noticeType}` : '',
      document?.publishedAt ? `发布日期：${document.publishedAt}` : '',
      document?.buyerName ? `招标人：${document.buyerName}` : '',
      evidence,
    ].filter(Boolean).join('\n');
    const attachments = [
      ...candidate.attachments,
      ...usableDocuments.map((item) => item.url || ''),
      ...(document?.attachmentUrls || []).filter(isNonRootDocumentUrl),
    ].filter((value, attachmentIndex, all) => Boolean(value) && all.indexOf(value) === attachmentIndex);
    if (detailReadSucceeded) {
      candidates[index] = {
        ...candidate,
        buyer_name: document?.buyerName || candidate.buyer_name,
        published_at: document?.publishedAt || candidate.published_at,
        raw_text: [detailMetadata, candidate.raw_text].filter(Boolean).join('\n\n').slice(0, 30_000),
        attachments,
      };
    }
    await recordStep({
      phase: 'extract',
      action: 'read_yulong_tender_detail',
      tool: `${browser.engine}${documents.some((item) => item.ocrProvider) ? '+ocr' : '+pdfjs'}`,
      result: {
        title: candidate.title,
        documentCount: documents.length,
        textLength: evidence.length,
        ocrProvider: documents.find((item) => item.ocrProvider)?.ocrProvider || '',
      },
    });
  }

  const enrichedBundle = { ...bundle, candidates };
  const finalCards = [...preliminaryCards];
  if (relevantIndexes.length) {
    const selectedBundle: CandidateBundle = {
      source_name: bundle.source_name,
      candidates: relevantIndexes.map((index) => candidates[index]).filter(Boolean),
    };
    const selectedCards = await assessScreenedNotices({
      task,
      bundle: selectedBundle,
      cards: buildScreenedNotices({ bundle: selectedBundle, task, terms }),
      assessor,
    });
    relevantIndexes.forEach((originalIndex, selectedIndex) => {
      const documents = documentsByIndex.get(originalIndex) || [];
      const detailReadSucceeded = documents.some((document) => hasUsableDocumentText(document.text));
      const card = selectedCards[selectedIndex];
      if (!card) return;
      finalCards[originalIndex] = {
        ...card,
        ...(detailReadSucceeded ? { deepReadAt: new Date().toISOString() } : {}),
        detailUrl: candidates[originalIndex]?.url,
        documentSummaries: documents.map((document) => ({
          title: document.title,
          url: document.url,
          filePath: document.filePath,
          textSnippet: document.text.slice(0, 1200),
          warning: document.warning,
          ocrProvider: document.ocrProvider,
        })),
      };
    });
  }
  return {
    status: 'ready',
    bundle: enrichedBundle,
    cards: finalCards,
    observation: resumeObservation,
    documentsByIndex,
    reason: '',
  };
};

export const runCollection = async ({
  task,
  browser,
  llmConfig = null,
  assessor = createDeterministicBidAssessor(),
  terms,
  resume = false,
  recordStep: record = async () => undefined,
  publicFeedCollector = collectSitePublicFeed,
  llmCandidateExtractor = extractCandidatesWithLLM,
  browserActionPlanner,
  ocrConfig = null,
  documentReader = readDocumentsFromObservation,
}: {
  task: LocalHelperTask;
  browser: BrowserSession;
} & CollectionRunOptions): Promise<CollectionRunResult> => {
  const recordStep = async (step: AgentHarnessStepInput) => {
    await record(step);
  };
  const site = definitionFor(task.sourceName);
  await recordStep({
    phase: 'plan',
    action: resume ? 'resume_collection' : 'start_collection',
    result: {
      sourceName: task.sourceName,
      collectionMode: site.collectionMode,
      browserEngine: browser.engine,
      entryUrl: task.entryUrl,
    },
  });

  if (!resume && site.collectionMode === 'public-feed') {
    const feed = await publicFeedCollector({ task }).catch((error): SitePublicFeedResult => ({
      provider: 'site-public-feed',
      status: 'failed',
      candidateBundle: null,
      artifacts: [],
      warnings: [error instanceof Error ? error.message : String(error)],
    }));
    await recordStep({
      phase: 'discover',
      action: 'collect_public_feed',
      tool: feed.provider,
      result: {
        status: feed.status,
        candidateCount: feed.candidateBundle?.candidates.length || 0,
        warnings: feed.warnings,
      },
    });
    if (feed.candidateBundle?.candidates.length) {
      return finalizeCandidates({
        task,
        bundle: feed.candidateBundle,
        artifacts: feed.artifacts,
        assessor,
        terms,
        recordStep,
      });
    }
    if (feed.status === 'no_new') {
      return {
        status: 'completed',
        humanReason: '',
        candidateBundle: null,
        artifacts: feed.artifacts,
        resultSummary: '公开公告源读取完成，本次没有新公告。',
        discoveredLinks: [],
        screenedNotices: [],
      };
    }
  }

  if (site.browserJourney && task.sourceName !== '裕龙招投标网') {
    const journey = await runBrowserSearchJourney({
      task,
      browser,
      definition: site,
      llmConfig,
      llmCandidateExtractor,
    });
    await recordStep({
      phase: journey.status === 'request_human' ? 'human' : 'discover',
      action: 'run_site_browser_journey',
      tool: browser.engine,
      result: {
        status: journey.status,
        searchedQueries: journey.searchedQueries,
        candidateCount: journey.candidateBundle?.candidates.length || 0,
        reason: journey.humanReason,
      },
    });
    if (journey.status === 'request_human') {
      const screenshotPath = await browser.screenshot?.().catch(() => '') || '';
      return {
        status: 'request_human',
        humanReason: journey.humanReason,
        observation: { ...journey.observation, screenshotPath },
        candidateBundle: journey.candidateBundle,
        artifacts: journey.artifacts,
        resultSummary: journey.humanReason,
        discoveredLinks: discoveredLinksFor(journey.observation, journey.candidateBundle),
        screenedNotices: journey.candidateBundle
          ? buildScreenedNotices({ bundle: journey.candidateBundle, task, terms })
          : [],
      };
    }
    if (!journey.candidateBundle?.candidates.length) {
      return {
        status: 'completed',
        humanReason: '',
        observation: journey.observation,
        candidateBundle: null,
        artifacts: journey.artifacts,
        resultSummary: journey.searchedQueries.length
          ? `已完成 ${journey.searchedQueries.length} 个重点产品查询，本次没有近期采购公告。`
          : '已完成最新公告巡检，本次没有近期采购公告。',
        discoveredLinks: discoveredLinksFor(journey.observation, null),
        screenedNotices: [],
      };
    }
    const preliminaryCards = await assessScreenedNotices({
      task,
      bundle: journey.candidateBundle,
      cards: buildScreenedNotices({ bundle: journey.candidateBundle, task, terms }),
      assessor,
    });
    const relevantIndexes = preliminaryCards
      .map((card, index) => card.recommendedAction !== 'ignore' ? index : -1)
      .filter((index) => index >= 0)
      .slice(0, site.browserJourney.maxDetails);
    const detailed = await readRelevantBrowserDetails({
      task,
      browser,
      definition: site,
      bundle: journey.candidateBundle,
      relevantIndexes,
      ocrConfig,
      documentReader,
    });
    await recordStep({
      phase: detailed.status === 'request_human' ? 'human' : 'extract',
      action: 'read_relevant_browser_details',
      tool: `${browser.engine}${[...detailed.documentsByIndex.values()].flat().some((item) => item.ocrProvider) ? '+ocr' : '+document'}`,
      result: {
        status: detailed.status,
        requestedCount: relevantIndexes.length,
        documentCount: [...detailed.documentsByIndex.values()].flat().length,
        reason: detailed.reason,
      },
    });
    if (detailed.status === 'request_human') {
      const detailObservation = detailed.observation || journey.observation;
      const screenshotPath = await browser.screenshot?.().catch(() => '') || '';
      return {
        status: 'request_human',
        humanReason: detailed.reason,
        observation: { ...detailObservation, screenshotPath },
        candidateBundle: detailed.bundle,
        artifacts: [...journey.artifacts, ...buildObservationArtifacts(detailObservation, task)],
        resultSummary: detailed.reason,
        discoveredLinks: discoveredLinksFor(detailObservation, detailed.bundle),
        screenedNotices: preliminaryCards,
      };
    }
    const finalCards = [...preliminaryCards];
    if (relevantIndexes.length) {
      const selectedBundle: CandidateBundle = {
        source_name: detailed.bundle.source_name,
        candidates: relevantIndexes.map((index) => detailed.bundle.candidates[index]).filter(Boolean),
      };
      const assessedDetails = await assessScreenedNotices({
        task,
        bundle: selectedBundle,
        cards: buildScreenedNotices({ bundle: selectedBundle, task, terms }),
        assessor,
      });
      relevantIndexes.forEach((originalIndex, selectedIndex) => {
        const documents = detailed.documentsByIndex.get(originalIndex) || [];
        const card = assessedDetails[selectedIndex];
        if (!card) return;
        const detailReadSucceeded = documents.some((document) => hasUsableDocumentText(document.text));
        finalCards[originalIndex] = {
          ...card,
          ...(detailReadSucceeded ? { deepReadAt: new Date().toISOString() } : {}),
          detailUrl: detailed.bundle.candidates[originalIndex]?.url,
          documentSummaries: documents.map((document) => ({
            title: document.title,
            url: document.url,
            filePath: document.filePath,
            textSnippet: document.text.slice(0, 1200),
            warning: document.warning,
            ocrProvider: document.ocrProvider,
          })),
        };
      });
    }
    return finalizeCandidates({
      task,
      bundle: detailed.bundle,
      observation: journey.observation,
      artifacts: journey.artifacts,
      assessor,
      terms,
      recordStep,
      assessedCards: finalCards,
    });
  }

  let yulongSearchCompleted = false;
  let yulongCollectedPages = 0;
  let observation: BrowserObservation;
  let resumedYulongDetail: BrowserObservation | undefined;
  let resumedYulongSavedList: BrowserObservation | undefined;
  if (task.sourceName === '裕龙招投标网') {
    if (resume && task.lastCandidateBundle?.candidates.length) {
      const current = await browser.observe();
      if (isYulongDetailPage(current) && !current.humanChallengeVisible) resumedYulongDetail = current;
      else if (/\/bulletinList(?:\?|$)/i.test(decodeURIComponent(current.url || ''))) {
        // The public platform has a reproducible upstream bug on pages > 1:
        // after VAPTCHA succeeds, an unsuccessful search response leaves
        // loadingList=false forever. The previous run already persisted the
        // verified latest-page rows, so resume from that durable checkpoint
        // instead of repeating or advancing the broken historical pagination.
        resumedYulongSavedList = current;
      }
    }
    const automation = resumedYulongDetail || resumedYulongSavedList ? null : await runYulongBrowserAgent({
      browser,
      task: { ...task, entryUrl: task.entryUrl || site.entryUrl || '' },
      resume,
      config: llmConfig,
      planner: browserActionPlanner,
    });
    observation = resumedYulongDetail || resumedYulongSavedList || automation?.observation || {
      title: '', url: '', visibleText: '',
    };
    yulongSearchCompleted = Boolean(resumedYulongDetail || resumedYulongSavedList) ||
      Boolean(automation?.searchCompleted);
    yulongCollectedPages = resumedYulongSavedList ? 1 : automation?.collectedPages || 0;
    await recordStep({
      phase: !automation || automation.status === 'ready' ? 'browser' : 'human',
      action: resumedYulongDetail
        ? 'resume_yulong_detail'
        : resumedYulongSavedList
          ? 'resume_yulong_saved_daily_page'
          : automation?.status === 'ready'
            ? 'collect_yulong_search_pages'
            : 'prepare_yulong_human_takeover',
      tool: browser.engine,
      observation: {
        title: observation.title,
        url: observation.url,
        visibleTextLength: observation.visibleText.length,
        networkResponseCount: observation.networkResponses?.length || 0,
      },
      result: {
        status: automation?.status || 'ready',
        reason: automation?.humanReason || '',
        collectedPages: automation?.collectedPages || 0,
        searchQuery: observation.searchQuery || '',
      },
    });
    if (automation && automation.status !== 'ready') {
      const screenshotPath = await browser.screenshot?.().catch(() => '') || '';
      const artifacts = buildObservationArtifacts(observation, task);
      const partialBundle = mergeBundles(
        task.sourceName,
        task.lastCandidateBundle,
        extractCandidateBundle(observation, task, site),
      );
      return {
        status: 'request_human',
        humanReason: automation.humanReason,
        observation: { ...observation, screenshotPath },
        candidateBundle: partialBundle,
        artifacts,
        resultSummary: automation.humanReason,
        discoveredLinks: discoveredLinksFor(observation, partialBundle),
        screenedNotices: partialBundle ? buildScreenedNotices({ bundle: partialBundle, task, terms }) : [],
      };
    }
  } else {
    observation = resume
      ? await browser.observe()
      : await browser.open(task.entryUrl || site.entryUrl || '');
  }
  // The Yulong state machine has already verified every collected page is a
  // scoped, structured search result and separately checked visible/blocking
  // challenges. Do not let stale failed requests from the same browser page
  // overrule that stronger evidence.
  const analysis = task.sourceName === '裕龙招投标网' && yulongSearchCompleted
    ? { status: 'ready', reason: '' }
    : analyzeObservation(observation, site);
  const artifacts = buildObservationArtifacts(observation, task);
  await recordStep({
    phase: 'browser',
    action: resume ? 'observe_after_human' : 'open_site',
    tool: browser.engine,
    observation: {
      title: observation.title,
      url: observation.url,
      visibleTextLength: observation.visibleText.length,
      networkResponseCount: observation.networkResponses?.length || 0,
    },
    result: { status: analysis.status, reason: analysis.reason },
  });

  if (analysis.status === 'request_human') {
    const screenshotPath = await browser.screenshot?.().catch(() => '') || '';
    return {
      status: 'request_human',
      humanReason: analysis.reason,
      observation: { ...observation, screenshotPath },
      candidateBundle: null,
      artifacts,
      resultSummary: analysis.reason,
      discoveredLinks: discoveredLinksFor(observation, null),
    };
  }

  const deterministicBundle = resumedYulongDetail || resumedYulongSavedList
    ? null
    : extractCandidateBundle(observation, task, site);
  const llmBundle = resumedYulongDetail || resumedYulongSavedList ? null : await llmCandidateExtractor({
    task,
    observation,
    config: llmConfig,
  }).catch(async (error) => {
    await recordStep({
      phase: 'error',
      action: 'llm_extract_candidates_failed',
      tool: 'openai-compatible-chat',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  // LLM candidates are normalized against observed URLs and carry richer row
  // context, so they take precedence over broad line-regex candidates.
  const bundle = mergeBundles(task.sourceName, task.lastCandidateBundle, llmBundle, deterministicBundle);
  await recordStep({
    phase: 'extract',
    action: 'extract_candidates',
    tool: llmBundle ? 'deterministic+llm' : 'deterministic',
    result: {
      deterministicCount: deterministicBundle?.candidates.length || 0,
      llmCount: llmBundle?.candidates.length || 0,
      mergedCount: bundle?.candidates.length || 0,
    },
  });

  if (!bundle?.candidates.length) {
    if (task.sourceName === '裕龙招投标网' && yulongSearchCompleted) {
      return {
        status: 'completed',
        humanReason: '',
        observation,
        candidateBundle: null,
        artifacts,
        resultSummary: `已完成“裕龙石化”搜索并巡检 ${yulongCollectedPages || 1} 页，本次没有可供筛选的采购公告。`,
        discoveredLinks: discoveredLinksFor(observation, null),
        screenedNotices: [],
      };
    }
    return {
      status: 'request_human',
      humanReason: '当前页面没有稳定识别到公告结果，请确认已完成验证并停留在正确的公告列表。',
      observation,
      candidateBundle: null,
      artifacts,
      resultSummary: '页面已读取，但没有稳定识别到公告候选。',
      discoveredLinks: discoveredLinksFor(observation, null),
    };
  }

  if (task.sourceName === '裕龙招投标网') {
    const storedCards = Array.isArray(task.lastScreenedNotices) &&
      task.lastScreenedNotices.length === bundle.candidates.length
      ? task.lastScreenedNotices as ScreenedNotice[]
      : null;
    const preliminaryCards = storedCards || await assessScreenedNotices({
      task,
      bundle,
      cards: buildScreenedNotices({ bundle, task, terms }),
      assessor,
    });
    const enriched = await enrichYulongDetails({
      task,
      bundle,
      preliminaryCards,
      browser,
      resumeObservation: resumedYulongDetail,
      ocrConfig,
      documentReader,
      assessor,
      terms,
      recordStep,
    });
    if (enriched.status === 'request_human') {
      const screenshotPath = await browser.screenshot?.().catch(() => '') || '';
      const detailObservation = enriched.observation || observation;
      return {
        status: 'request_human',
        humanReason: enriched.reason,
        observation: { ...detailObservation, screenshotPath },
        candidateBundle: enriched.bundle,
        artifacts: [...artifacts, ...buildObservationArtifacts(detailObservation, task)],
        resultSummary: enriched.reason,
        discoveredLinks: discoveredLinksFor(detailObservation, enriched.bundle),
        screenedNotices: enriched.cards,
      };
    }
    return finalizeCandidates({
      task,
      bundle: enriched.bundle,
      observation,
      artifacts,
      assessor,
      terms,
      recordStep,
      assessedCards: enriched.cards,
    });
  }

  return finalizeCandidates({
    task,
    bundle,
    observation,
    artifacts,
    assessor,
    terms,
    recordStep,
  });
};

export const runControlledLocalAgentTask = runCollection;
export type LocalAgentRunResult = CollectionRunResult;
