import type { DiscoveredLink, LinkDiscoveryResult, SearchAdapter } from './agent-search-adapter.ts';
import type { AgentHarnessStepInput } from './agent-harness.ts';
import {
  createAgentToolRunner,
  createBiddingAgentToolbox,
  createRecordingBrowserTool,
} from './agent-toolbox.ts';
import { createCdpMcpBrowserTool } from './cdp-mcp-adapter.ts';
import {
  formatDocumentEvidence,
  readDocumentsFromObservation,
  type DocumentReadResult,
} from './document-reader.ts';
import {
  createDefaultReActPlanner,
  type ReActAction,
  type ReActPlanner,
  type ReActPlannerState,
} from './react-planner.ts';
import {
  analyzeObservation,
  buildObservationArtifacts,
  extractCandidateBundle,
  type BrowserHarnessRuntime,
  type BrowserObservation,
  type CandidateBundle,
  type LocalHelperArtifact,
  type LocalHelperTask,
} from './site-harness.ts';
import { profileFor } from './site-profiles.ts';

export type ReActCollectionResult = {
  status: 'request_human' | 'completed' | 'failed';
  humanReason: string;
  observation?: BrowserObservation;
  candidateBundle: CandidateBundle | null;
  artifacts: LocalHelperArtifact[];
  resultSummary: string;
  discoveredLinks: DiscoveredLink[];
  documents: DocumentReadResult[];
  iterations: Array<{
    iteration: number;
    action: ReActAction;
  }>;
};

const MAX_VISIBLE_TEXT_SNIPPET = 1200;

const emptyDiscovery = (): LinkDiscoveryResult => ({
  provider: '',
  query: '',
  links: [],
  warnings: [],
});

const compact = (value = '', limit = MAX_VISIBLE_TEXT_SNIPPET) => {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}...[truncated]` : text;
};

const unique = <T>(items: T[]) => [...new Set(items.filter(Boolean))];

const hasDocumentSignals = (
  observation: BrowserObservation | undefined,
  bundle: CandidateBundle | null,
) => {
  if ((bundle?.candidates || []).some((candidate) => candidate.attachments?.length)) return true;
  if ((observation?.downloadedFiles || []).length > 0) return true;
  return (observation?.links || []).some((link) => (
    /\.(?:pdf|doc|docx|txt|html?|xml)(?:[?#].*)?$/i.test(link.href) ||
    /附件|下载|标书|采购文件|招标文件|询价文件|技术文件|规格书/i.test(`${link.text} ${link.title || ''}`)
  ));
};

const mergeDocumentsIntoBundle = (
  bundle: CandidateBundle | null,
  documents: DocumentReadResult[],
): CandidateBundle | null => {
  if (!bundle || documents.length === 0) return bundle;
  const evidence = formatDocumentEvidence(documents);
  const documentRefs = documents
    .map((document) => document.url || document.filePath || '')
    .filter(Boolean);
  return {
    ...bundle,
    candidates: bundle.candidates.map((candidate) => ({
      ...candidate,
      raw_text: [candidate.raw_text, evidence].filter(Boolean).join('\n\n'),
      attachments: unique([...(candidate.attachments || []), ...documentRefs]),
    })),
  };
};

const documentArtifactsFor = (
  documents: DocumentReadResult[],
  task: LocalHelperTask,
): LocalHelperArtifact[] => documents.map((document, index) => ({
  artifact_type: 'manual_text',
  title: `${task.sourceName || '本地 Agent'} ReAct 附件 ${index + 1}：${document.title}`,
  url: document.url,
  content: [
    document.filePath ? `本地文件：${document.filePath}` : '',
    document.warning ? `提示：${document.warning}` : '',
    document.text || '',
  ].filter(Boolean).join('\n'),
  mime_type: 'text/plain',
}));

const plannerStateFor = ({
  task,
  iteration,
  maxIterations,
  tools,
  discoveredLinks,
  openedUrls,
  observation,
  candidateBundle,
  documents,
  lastHumanReason,
  warnings,
}: {
  task: LocalHelperTask;
  iteration: number;
  maxIterations: number;
  tools: ReActPlannerState['tools'];
  discoveredLinks: DiscoveredLink[];
  openedUrls: Set<string>;
  observation?: BrowserObservation;
  candidateBundle: CandidateBundle | null;
  documents: DocumentReadResult[];
  lastHumanReason?: string;
  warnings: string[];
}): ReActPlannerState => ({
  task,
  iteration,
  maxIterations,
  tools,
  discoveredLinks: discoveredLinks.map((link) => ({
    ...link,
    visited: openedUrls.has(link.url),
  })),
  openedUrls: [...openedUrls],
  observation: observation ? {
    title: observation.title || '',
    url: observation.url || '',
    visibleTextSnippet: compact(observation.visibleText || ''),
    linkCount: observation.links?.length || 0,
    networkResponseCount: observation.networkResponses?.length || 0,
    downloadedFileCount: observation.downloadedFiles?.length || 0,
  } : undefined,
  candidateCount: candidateBundle?.candidates?.length || 0,
  documentCount: documents.length,
  hasDocumentSignals: hasDocumentSignals(observation, candidateBundle),
  lastHumanReason,
  warnings,
});

const resultSummaryFor = ({
  candidateBundle,
  discoveredLinks,
  documents,
  lastHumanReason,
  warnings = [],
}: {
  candidateBundle: CandidateBundle | null;
  discoveredLinks: DiscoveredLink[];
  documents: DocumentReadResult[];
  lastHumanReason?: string;
  warnings?: string[];
}) => {
  const warningLines = warnings.map((warning) => `提示：${warning}`);
  if (lastHumanReason) return [lastHumanReason, ...warningLines].filter(Boolean).join('\n');
  const count = candidateBundle?.candidates?.length || 0;
  if (count > 0) {
    return [
      `ReAct 采集识别到 ${count} 条候选公告。`,
      documents.length ? `已读取 ${documents.length} 个附件/文件线索。` : '',
      ...warningLines,
    ].filter(Boolean).join('\n');
  }
  return [
    `ReAct 已尝试 ${discoveredLinks.length} 个入口，但尚未识别到候选公告。`,
    ...warningLines,
  ].filter(Boolean).join('\n');
};

export const runReActCollectionAgent = async ({
  task,
  browser,
  search,
  planner = createDefaultReActPlanner(),
  recordStep = async () => undefined,
  maxIterations = 6,
  documentReader = readDocumentsFromObservation,
}: {
  task: LocalHelperTask;
  browser: BrowserHarnessRuntime;
  search: SearchAdapter;
  planner?: ReActPlanner;
  recordStep?: (step: AgentHarnessStepInput) => Promise<void> | void;
  maxIterations?: number;
  documentReader?: typeof readDocumentsFromObservation;
}): Promise<ReActCollectionResult> => {
  const baseBrowserTool = createCdpMcpBrowserTool({ browser });
  const runner = createAgentToolRunner({ recordStep });
  const toolbox = createBiddingAgentToolbox({
    task,
    search,
    browser: baseBrowserTool,
    documentReader,
  });
  const browserTool = createRecordingBrowserTool({
    browser: baseBrowserTool,
    runner,
  });
  const profile = profileFor(task.sourceName);
  let discovery = emptyDiscovery();
  let discoveredLinks: DiscoveredLink[] = [];
  const openedUrls = new Set<string>();
  let observation: BrowserObservation | undefined;
  let candidateBundle: CandidateBundle | null = null;
  let artifacts: LocalHelperArtifact[] = [];
  let documents: DocumentReadResult[] = [];
  let lastHumanReason = '';
  const iterations: ReActCollectionResult['iterations'] = [];

  await recordStep({
    phase: 'plan',
    action: 'react_loop_started',
    tool: planner.name,
    result: {
      maxIterations,
      tools: toolbox.manifests().map((tool) => tool.name),
    },
  });

  const refreshCandidates = async () => {
    if (!observation) return;
    const analysis = analyzeObservation(observation, profile);
    if (analysis.status === 'request_human') {
      lastHumanReason = analysis.reason;
      candidateBundle = null;
      await recordStep({
        phase: 'human',
        action: 'react_request_human_from_observation',
        tool: 'site-harness',
        observation: {
          title: observation.title || '',
          url: observation.url || '',
          visibleTextSnippet: compact(observation.visibleText || '', 600),
        },
        result: {
          reason: analysis.reason,
        },
      });
      return;
    }
    const extracted = extractCandidateBundle(observation, task, profile);
    candidateBundle = extracted.candidates.length > 0 ? extracted : null;
    const observationArtifacts = buildObservationArtifacts(observation, task);
    artifacts = [
      ...artifacts,
      ...observationArtifacts,
    ].slice(-80);
    await recordStep({
      phase: 'extract',
      action: 'react_extract_candidates',
      tool: 'site-harness',
      observation: {
        title: observation.title || '',
        url: observation.url || '',
      },
      result: {
        candidateCount: extracted.candidates.length,
        artifactCount: observationArtifacts.length,
      },
    });
  };

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const state = plannerStateFor({
      task,
      iteration,
      maxIterations,
      tools: toolbox.manifests(),
      discoveredLinks,
      openedUrls,
      observation,
      candidateBundle,
      documents,
      lastHumanReason,
      warnings: discovery.warnings || [],
    });
    const action = await planner.chooseAction(state);
    iterations.push({ iteration, action });
    await recordStep({
      phase: 'plan',
      action: 'react_decide_next_action',
      tool: planner.name,
      result: {
        iteration,
        actionType: action.type,
        reason: action.reason,
        candidateCount: state.candidateCount,
        discoveredLinkCount: state.discoveredLinks.length,
        documentCount: state.documentCount,
      },
    });

    if (action.type === 'search') {
      discovery = await runner.call(toolbox.linkDiscovery, { limit: action.limit || 8 }, {
        phase: 'discover',
        action: 'react_search_links',
      });
      discoveredLinks = discovery.links || [];
      artifacts = [
        ...artifacts,
        {
          artifact_type: 'log',
          title: `${task.sourceName || '本地 Agent'} ReAct 链接发现`,
          url: task.entryUrl,
          content: [
            `搜索工具：${discovery.provider}`,
            discovery.query ? `搜索语句：${discovery.query}` : '',
            ...(discovery.warnings || []).map((warning) => `提示：${warning}`),
            ...discoveredLinks.map((link, index) => `${index + 1}. ${link.title || link.url} (${link.score ?? 0})\n${link.url}`),
          ].filter(Boolean).join('\n'),
          mime_type: 'text/plain',
        },
      ].slice(-80);
      continue;
    }

    if (action.type === 'open_url') {
      try {
        observation = await browserTool.open(action.url);
        openedUrls.add(action.url);
        const screenshotPath = await browserTool.screenshot().catch(() => '');
        if (screenshotPath) {
          observation = {
            ...observation,
            screenshotPath,
          };
        }
        await refreshCandidates();
      } catch (error) {
        lastHumanReason = `打开页面失败，需要员工确认网络/登录/站点可用性：${error instanceof Error ? error.message : String(error)}`;
      }
      continue;
    }

    if (action.type === 'observe') {
      observation = await browserTool.observe();
      const screenshotPath = await browserTool.screenshot().catch(() => '');
      if (screenshotPath) {
        observation = {
          ...observation,
          screenshotPath,
        };
      }
      await refreshCandidates();
      continue;
    }

    if (action.type === 'read_documents') {
      if (!observation) {
        lastHumanReason = '没有可读取附件的页面观察，需要员工打开公告详情页后继续。';
        continue;
      }
      const newlyRead = await runner.call(toolbox.documentRead, {
        observation,
        maxDocuments: action.maxDocuments || 2,
      }, {
        phase: 'extract',
        action: 'react_read_documents',
      });
      documents = [...documents, ...newlyRead].slice(0, 8);
      candidateBundle = mergeDocumentsIntoBundle(candidateBundle, newlyRead);
      artifacts = [
        ...artifacts,
        ...documentArtifactsFor(newlyRead, task),
      ].slice(-80);
      continue;
    }

    if (action.type === 'finish') {
      return {
        status: candidateBundle?.candidates?.length ? 'completed' : 'request_human',
        humanReason: candidateBundle?.candidates?.length ? '' : 'ReAct 决定结束，但没有识别到候选公告，需要员工检查页面。',
        observation,
        candidateBundle,
        artifacts,
        resultSummary: resultSummaryFor({
          candidateBundle,
          discoveredLinks,
          documents,
          warnings: discovery.warnings || [],
        }),
        discoveredLinks,
        documents,
        iterations,
      };
    }

    if (action.type === 'request_human') {
      return {
        status: 'request_human',
        humanReason: action.reason,
        observation,
        candidateBundle: null,
        artifacts,
        resultSummary: resultSummaryFor({
          candidateBundle: null,
          discoveredLinks,
          documents,
          lastHumanReason: action.reason,
          warnings: discovery.warnings || [],
        }),
        discoveredLinks,
        documents,
        iterations,
      };
    }
  }

  const fallbackHumanReason = lastHumanReason ||
    'ReAct 已达到最大步数，仍未稳定识别到候选公告，需要员工检查当前页面后继续。';
  return {
    status: candidateBundle?.candidates?.length ? 'completed' : 'request_human',
    humanReason: candidateBundle?.candidates?.length ? '' : fallbackHumanReason,
    observation,
    candidateBundle,
    artifacts,
    resultSummary: resultSummaryFor({
      candidateBundle,
      discoveredLinks,
      documents,
      lastHumanReason: candidateBundle?.candidates?.length ? '' : fallbackHumanReason,
      warnings: discovery.warnings || [],
    }),
    discoveredLinks,
    documents,
    iterations,
  };
};
