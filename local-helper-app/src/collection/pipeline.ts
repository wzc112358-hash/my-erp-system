import type {
  BrowserObservation,
  BrowserSession,
  CandidateBundle,
  LocalHelperArtifact,
  LocalHelperTask,
  TenderCandidate,
} from '../browser/types.ts';
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
import type { LocalLLMConfig } from '../llm/client.ts';
import {
  collectSitePublicFeed,
  type SitePublicFeedResult,
} from '../sites/public-collectors.ts';
import { definitionFor } from '../sites/registry.ts';
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
};

const candidateKey = (candidate: TenderCandidate) => (
  `${candidate.title.replace(/\s+/g, '')}|${candidate.url}`
);

const mergeBundles = (
  sourceName: string,
  ...bundles: Array<CandidateBundle | null | undefined>
): CandidateBundle | null => {
  const candidates = bundles.flatMap((bundle) => bundle?.candidates || []);
  const unique = candidates.filter((candidate, index, all) => (
    index === all.findIndex((item) => candidateKey(item) === candidateKey(candidate))
  )).slice(0, 40);
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
}: {
  task: LocalHelperTask;
  bundle: CandidateBundle;
  observation?: BrowserObservation;
  artifacts: LocalHelperArtifact[];
  assessor: BidAssessor;
  terms?: ProductTerm[];
  recordStep: (step: AgentHarnessStepInput) => Promise<void>;
}): Promise<CollectionRunResult> => {
  const cards = await assessScreenedNotices({
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

  const observation = resume
    ? await browser.observe()
    : await browser.open(task.entryUrl || site.entryUrl || '');
  const analysis = analyzeObservation(observation, site);
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

  const deterministicBundle = extractCandidateBundle(observation, task, site);
  const llmBundle = await llmCandidateExtractor({
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
  const bundle = mergeBundles(task.sourceName, llmBundle, deterministicBundle);
  await recordStep({
    phase: 'extract',
    action: 'extract_candidates',
    tool: llmBundle ? 'deterministic+llm' : 'deterministic',
    result: {
      deterministicCount: deterministicBundle.candidates.length,
      llmCount: llmBundle?.candidates.length || 0,
      mergedCount: bundle?.candidates.length || 0,
    },
  });

  if (!bundle?.candidates.length) {
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
