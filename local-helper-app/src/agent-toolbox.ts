import type { AgentHarnessStepInput } from './agent-harness.ts';
import type {
  LinkDiscoveryResult,
  SearchAdapter,
} from './agent-search-adapter.ts';
import type { ControlledBrowserTool } from './cdp-mcp-adapter.ts';
import {
  readDocumentsFromObservation,
  type DocumentReadResult,
} from './document-reader.ts';
import type {
  BrowserObservation,
  LocalHelperTask,
} from './site-harness.ts';

export type AgentToolKind = 'search' | 'browser' | 'document' | 'assessment' | 'llm' | 'utility';

export type AgentToolManifest = {
  name: string;
  kind: AgentToolKind;
  description: string;
  inputSchema?: Record<string, unknown>;
};

export type AgentTool<Input extends Record<string, unknown> = Record<string, unknown>, Output = unknown> =
  AgentToolManifest & {
    invoke(input: Input): Promise<Output>;
    summarize?(output: Output, input: Input): Record<string, unknown> | string;
  };

export type AgentToolRunner = ReturnType<typeof createAgentToolRunner>;

export const DEFAULT_AGENT_TOOL_MANIFESTS: AgentToolManifest[] = [
  {
    name: 'link_discovery.search',
    kind: 'search',
    description: 'Discover public bidding entry and notice links with Firecrawl or entry URL fallback.',
    inputSchema: { limit: 'number' },
  },
  {
    name: 'browser.open',
    kind: 'browser',
    description: 'Open a page in the controlled local browser.',
    inputSchema: { url: 'string' },
  },
  {
    name: 'browser.observe',
    kind: 'browser',
    description: 'Observe the current controlled browser page.',
  },
  {
    name: 'browser.screenshot',
    kind: 'browser',
    description: 'Capture a screenshot from the controlled local browser.',
  },
  {
    name: 'documents.read',
    kind: 'document',
    description: 'Read tender attachments from downloaded files or document links.',
    inputSchema: {
      observation: 'BrowserObservation',
      maxDocuments: 'number',
    },
  },
];

const compactText = (value = '', limit = 600) => {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > limit ? `${compact.slice(0, limit)}...[truncated]` : compact;
};

const browserObservationSummary = (observation: BrowserObservation) => ({
  title: observation.title || '',
  url: observation.url || '',
  visibleTextSnippet: compactText(observation.visibleText || ''),
  linkCount: observation.links?.length || 0,
  networkResponseCount: observation.networkResponses?.length || 0,
  downloadedFileCount: observation.downloadedFiles?.length || 0,
  screenshotPath: observation.screenshotPath || '',
});

const discoverySummary = (result: LinkDiscoveryResult) => ({
  provider: result.provider,
  query: result.query,
  linkCount: result.links.length,
  topLinks: result.links.slice(0, 5).map((link) => ({
    title: link.title,
    url: link.url,
    source: link.source,
    score: link.score || 0,
  })),
  warnings: result.warnings,
});

const documentSummary = (documents: DocumentReadResult[]) => ({
  documentCount: documents.length,
  documents: documents.map((document) => ({
    title: document.title,
    url: document.url || '',
    filePath: document.filePath || '',
    contentType: document.contentType || '',
    textLength: document.text.length,
    warning: document.warning || '',
  })),
});

const fallbackSummary = (output: unknown) => {
  if (typeof output === 'string') return compactText(output);
  if (Array.isArray(output)) return { itemCount: output.length };
  if (output && typeof output === 'object') return output as Record<string, unknown>;
  return { value: output };
};

const errorMessageFor = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const createAgentToolRunner = ({
  recordStep = async () => undefined,
  now = () => Date.now(),
}: {
  recordStep?: (step: AgentHarnessStepInput) => Promise<void> | void;
  now?: () => number;
} = {}) => ({
  async call<Input extends Record<string, unknown>, Output>(
    tool: AgentTool<Input, Output>,
    input: Input,
    options: {
      phase: AgentHarnessStepInput['phase'];
      action?: string;
      observeInput?: boolean;
      summarize?: (output: Output, input: Input) => Record<string, unknown> | string;
    },
  ): Promise<Output> {
    const startedAt = now();
    const action = options.action || tool.name;
    try {
      const output = await tool.invoke(input);
      const summary = (options.summarize || tool.summarize || fallbackSummary)(output, input);
      const result = typeof summary === 'string'
        ? summary
        : {
          durationMs: Math.max(0, now() - startedAt),
          ...summary,
        };
      await recordStep({
        phase: options.phase,
        action,
        tool: tool.name,
        observation: options.observeInput ? input : undefined,
        result,
      });
      return output;
    } catch (error) {
      await recordStep({
        phase: 'error',
        action,
        tool: tool.name,
        observation: options.observeInput ? input : undefined,
        errorMessage: errorMessageFor(error),
      });
      throw error;
    }
  },
});

export const createLinkDiscoveryTool = ({
  task,
  search,
}: {
  task: LocalHelperTask;
  search: SearchAdapter;
}): AgentTool<{ limit?: number }, LinkDiscoveryResult> => ({
  name: 'link_discovery.search',
  kind: 'search',
  description: 'Discover public bidding entry and notice links with Firecrawl or entry URL fallback.',
  inputSchema: {
    limit: 'number',
  },
  invoke: ({ limit }) => search.discoverLinks({ task, limit }),
  summarize: discoverySummary,
});

export const createBrowserOpenTool = ({
  browser,
}: {
  browser: ControlledBrowserTool;
}): AgentTool<{ url: string }, BrowserObservation> => ({
  name: `${browser.name}.open`,
  kind: 'browser',
  description: 'Open a page in the controlled local browser.',
  inputSchema: {
    url: 'string',
  },
  invoke: ({ url }) => browser.open(url),
  summarize: browserObservationSummary,
});

export const createBrowserObserveTool = ({
  browser,
}: {
  browser: ControlledBrowserTool;
}): AgentTool<Record<string, never>, BrowserObservation> => ({
  name: `${browser.name}.observe`,
  kind: 'browser',
  description: 'Observe the current controlled browser page.',
  invoke: () => browser.observe(),
  summarize: browserObservationSummary,
});

export const createBrowserScreenshotTool = ({
  browser,
}: {
  browser: ControlledBrowserTool;
}): AgentTool<Record<string, never>, { screenshotPath: string }> => ({
  name: `${browser.name}.screenshot`,
  kind: 'browser',
  description: 'Capture a screenshot from the controlled local browser.',
  invoke: async () => ({
    screenshotPath: await browser.screenshot(),
  }),
  summarize: (output) => output,
});

export const createDocumentReaderTool = ({
  reader = readDocumentsFromObservation,
}: {
  reader?: typeof readDocumentsFromObservation;
} = {}): AgentTool<{
  observation: BrowserObservation;
  maxDocuments?: number;
}, DocumentReadResult[]> => ({
  name: 'documents.read',
  kind: 'document',
  description: 'Read tender attachments from downloaded files or document links.',
  inputSchema: {
    observation: 'BrowserObservation',
    maxDocuments: 'number',
  },
  invoke: ({ observation, maxDocuments }) => reader({ observation, maxDocuments }),
  summarize: documentSummary,
});

export const createRecordingBrowserTool = ({
  browser,
  runner,
}: {
  browser: ControlledBrowserTool;
  runner: AgentToolRunner;
}): ControlledBrowserTool => {
  const openTool = createBrowserOpenTool({ browser });
  const observeTool = createBrowserObserveTool({ browser });
  const screenshotTool = createBrowserScreenshotTool({ browser });
  return {
    name: browser.name,
    open: (url) => runner.call(openTool, { url }, {
      phase: 'browser',
      action: 'browser_open',
      observeInput: true,
    }),
    observe: () => runner.call(observeTool, {}, {
      phase: 'browser',
      action: 'browser_observe',
    }),
    screenshot: async () => {
      const result = await runner.call(screenshotTool, {}, {
        phase: 'browser',
        action: 'browser_screenshot',
      });
      return result.screenshotPath;
    },
  };
};

export const createBiddingAgentToolbox = ({
  task,
  search,
  browser,
  documentReader,
}: {
  task: LocalHelperTask;
  search: SearchAdapter;
  browser: ControlledBrowserTool;
  documentReader?: typeof readDocumentsFromObservation;
}) => {
  const linkDiscovery = createLinkDiscoveryTool({ task, search });
  const browserOpen = createBrowserOpenTool({ browser });
  const browserObserve = createBrowserObserveTool({ browser });
  const browserScreenshot = createBrowserScreenshotTool({ browser });
  const documentRead = createDocumentReaderTool({ reader: documentReader });
  const tools = [
    linkDiscovery,
    browserOpen,
    browserObserve,
    browserScreenshot,
    documentRead,
  ];
  return {
    linkDiscovery,
    browserOpen,
    browserObserve,
    browserScreenshot,
    documentRead,
    tools,
    manifests: (): AgentToolManifest[] => tools.map((tool) => ({
      name: tool.name,
      kind: tool.kind,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
};
