import {
  createDefaultSearchAdapter,
  formatDiscoveredLinks,
  type DiscoveredLink,
  type LinkDiscoveryResult,
  type SearchAdapter,
} from './agent-search-adapter.ts';
import {
  assessOpportunityCards,
  createDeterministicBidAssessor,
  type BidAssessor,
} from './bid-assessment.ts';
import { createCdpMcpBrowserTool } from './cdp-mcp-adapter.ts';
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
  buildObservationArtifacts,
  createSiteHarness,
  type BrowserHarnessRuntime,
  type LocalHelperArtifact,
  type LocalHelperTask,
} from './site-harness.ts';
import { profileFor } from './site-profiles.ts';
import {
  summarizeCandidateBundle,
  type LocalAgentRunResult,
} from './local-agent-runner.ts';

export type ControlledAgentOptions = {
  search?: SearchAdapter;
  llm?: LLMAgentAdapter;
  assessor?: BidAssessor;
  terms?: ProductTerm[];
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

const selectedUrlFor = (task: LocalHelperTask, links: DiscoveredLink[]) =>
  links[0]?.url || task.entryUrl;

export const runControlledLocalAgentTask = async ({
  task,
  browser,
  search = createDefaultSearchAdapter(),
  llm = createDefaultLLMAgent(),
  assessor = createDeterministicBidAssessor(),
  terms,
}: {
  task: LocalHelperTask;
  browser: BrowserHarnessRuntime;
} & ControlledAgentOptions): Promise<LocalAgentRunResult> => {
  const discovery = await search.discoverLinks({ task, limit: 8 });
  const discoveredLinks = discovery.links || [];
  const targetUrl = selectedUrlFor(task, discoveredLinks);
  const browserTool = createCdpMcpBrowserTool({ browser });
  const harness = createSiteHarness({
    browser: browserTool,
    profile: profileFor(task.sourceName),
  });
  const agentTask = {
    ...task,
    entryUrl: targetUrl || task.entryUrl,
  };
  const result = await harness.openTask(agentTask);
  const screenshotPath = await browserTool.screenshot().catch(() => '');
  const observation = result.observation
    ? {
      ...result.observation,
      screenshotPath: screenshotPath || result.observation.screenshotPath,
    }
    : undefined;
  const artifacts = [
    discoveryArtifactFor(discovery, task),
    ...(observation ? buildObservationArtifacts(observation, task) : []),
  ];

  if (result.status === 'request_human') {
    const targetLine = targetUrl ? `已打开：${targetUrl}` : '没有可打开的入口。';
    return {
      status: 'request_human',
      humanReason: [
        `Agent 已完成公开链接发现，${targetLine}`,
        result.humanReason || '请员工完成登录/验证或手动进入公告列表后继续采集。',
      ].join(' '),
      observation,
      candidateBundle: null,
      artifacts,
      resultSummary: [
        `发现 ${discoveredLinks.length} 个候选入口。`,
        ...discovery.warnings,
        result.humanReason,
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
