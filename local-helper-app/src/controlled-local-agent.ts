import {
  createDefaultSearchAdapter,
  formatDiscoveredLinks,
  type LinkDiscoveryResult,
  type SearchAdapter,
} from './agent-search-adapter.ts';
import type { AgentHarnessStepInput } from './agent-harness.ts';
import {
  assessOpportunityCards,
  createDeterministicBidAssessor,
  type BidAssessor,
} from './bid-assessment.ts';
import {
  createDefaultLLMAgent,
  type LLMAgentAdapter,
} from './local-llm-agent.ts';
import {
  buildOpportunityCards,
  summarizeOpportunityCards,
  type ProductTerm,
} from './product-knowledge.ts';
import {
  type BrowserHarnessRuntime,
  type LocalHelperArtifact,
  type LocalHelperTask,
} from './site-harness.ts';
import {
  summarizeCandidateBundle,
  type LocalAgentRunResult,
} from './local-agent-runner.ts';
import {
  runReActCollectionAgent,
} from './react-collection-agent.ts';
import {
  createDefaultReActPlanner,
  type ReActPlanner,
} from './react-planner.ts';

export type ControlledAgentOptions = {
  search?: SearchAdapter;
  llm?: LLMAgentAdapter;
  assessor?: BidAssessor;
  terms?: ProductTerm[];
  recordStep?: (step: AgentHarnessStepInput) => Promise<void> | void;
  planner?: ReActPlanner;
  maxIterations?: number;
};

const discoveryArtifactFor = (
  discovery: LinkDiscoveryResult,
  task: LocalHelperTask,
): LocalHelperArtifact => ({
  artifact_type: 'log',
  title: `${task.sourceName || '本地 Agent'} 链接发现`,
  url: task.entryUrl,
  content: formatDiscoveredLinks(discovery),
  mime_type: 'text/plain',
});

export const runControlledLocalAgentTask = async ({
  task,
  browser,
  search = createDefaultSearchAdapter(),
  llm = createDefaultLLMAgent(),
  assessor = createDeterministicBidAssessor(),
  terms,
  recordStep = async () => undefined,
  planner = createDefaultReActPlanner(),
  maxIterations = 6,
}: {
  task: LocalHelperTask;
  browser: BrowserHarnessRuntime;
} & ControlledAgentOptions): Promise<LocalAgentRunResult> => {
  await recordStep({
    phase: 'plan',
    action: 'start_controlled_agent',
    result: {
      sourceName: task.sourceName,
      entryUrl: task.entryUrl,
      searchTerms: task.searchTerms || '',
    },
  });
  const result = await runReActCollectionAgent({
    task,
    browser,
    search,
    planner,
    recordStep,
    maxIterations,
  });
  const discoveredLinks = result.discoveredLinks || [];
  const observation = result.observation;
  const artifacts = result.artifacts.length > 0
    ? result.artifacts
    : [
      discoveryArtifactFor({
        provider: search.name,
        query: task.searchTerms || '',
        links: discoveredLinks,
        warnings: [],
      }, task),
    ];
  await recordStep({
    phase: 'extract',
    action: 'analyze_observation',
    tool: 'react-collection-agent',
    observation: {
      status: result.status,
      title: observation?.title || '',
      url: observation?.url || '',
      screenshotPath: observation?.screenshotPath || '',
    },
    result: {
      candidateCount: result.candidateBundle?.candidates?.length || 0,
      artifactCount: artifacts.length,
      humanReason: result.status === 'request_human' ? result.humanReason || '' : '',
    },
  });

  if (result.status === 'request_human') {
    await recordStep({
      phase: 'human',
      action: 'request_human_takeover',
      result: {
        reason: result.humanReason || '请员工完成登录/验证或手动进入公告列表后继续采集。',
        currentUrl: observation?.url || '',
      },
    });
    return {
      status: 'request_human',
      humanReason: [
        `ReAct Agent 已完成 ${result.iterations.length} 轮采集尝试。`,
        result.humanReason || '请员工完成登录/验证或手动进入公告列表后继续采集。',
      ].join(' '),
      observation,
      candidateBundle: null,
      artifacts,
      resultSummary: [
        `发现 ${discoveredLinks.length} 个候选入口。`,
        result.resultSummary,
      ].filter(Boolean).join('\n'),
      discoveredLinks,
    };
  }

  const opportunityCards = await assessOpportunityCards({
    task,
    bundle: result.candidateBundle,
    cards: buildOpportunityCards({ bundle: result.candidateBundle, task, terms }),
    assessor,
  });
  await recordStep({
    phase: 'assess',
    action: 'assess_opportunity_cards',
    tool: 'bid-assessor',
    result: {
      cardCount: opportunityCards.length,
      topActions: opportunityCards.slice(0, 5).map((card) => card.recommendedAction),
    },
  });
  const fallbackSummary = summarizeOpportunityCards(
    opportunityCards,
    summarizeCandidateBundle(result.candidateBundle),
  );
  const resultSummary = await llm.summarize({
    task,
    discoveredLinks,
    candidateBundle: result.candidateBundle,
    fallbackSummary,
  }).catch(() => fallbackSummary);
  await recordStep({
    phase: 'summarize',
    action: 'summarize_agent_result',
    tool: 'llm-or-deterministic',
    result: {
      summaryLength: resultSummary.length,
      fallbackUsed: resultSummary === fallbackSummary,
    },
  });

  return {
    status: 'completed',
    humanReason: '',
    observation,
    candidateBundle: result.candidateBundle,
    artifacts,
    resultSummary,
    discoveredLinks,
    opportunityCards,
  };
};
