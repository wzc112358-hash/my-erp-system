export type McpToolPlan = {
  id: string;
  label: string;
  transport: 'stdio';
  command: string;
  args: string[];
  requiredEnv?: string[];
  optionalEnv?: string[];
  capabilities: string[];
  fallbackAdapter: string;
  notes: string[];
};

export type McpToolPlanStatus = McpToolPlan & {
  configured: boolean;
  missingEnv: string[];
  status: 'ready' | 'fallback';
};

export const DEFAULT_MCP_TOOL_PLANS: McpToolPlan[] = [
  {
    id: 'chrome-devtools',
    label: 'Chrome DevTools MCP',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest', '--no-usage-statistics'],
    optionalEnv: ['CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS'],
    capabilities: [
      'browser.navigate',
      'browser.screenshot',
      'browser.network',
      'browser.console',
      'browser.input',
    ],
    fallbackAdapter: 'playwright-cdp',
    notes: [
      'Use for authenticated browser sessions, screenshots, network inspection, and precise page actions.',
      'The local helper keeps Playwright as the packaged fallback so Electron builds do not depend on MCP being installed.',
    ],
  },
  {
    id: 'firecrawl',
    label: 'Firecrawl MCP',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'firecrawl-mcp'],
    requiredEnv: ['FIRECRAWL_API_KEY'],
    optionalEnv: [
      'FIRECRAWL_API_URL',
      'FIRECRAWL_RETRY_MAX_ATTEMPTS',
      'FIRECRAWL_RETRY_INITIAL_DELAY',
      'FIRECRAWL_RETRY_MAX_DELAY',
    ],
    capabilities: [
      'web.search',
      'web.scrape',
      'web.map',
      'web.crawl',
      'web.batch_scrape',
    ],
    fallbackAdapter: 'firecrawl-http+entry-url',
    notes: [
      'Use search/map to discover public notice URLs before opening the controlled browser.',
      'Use scrape only for public pages; authenticated content should stay in the local browser path.',
    ],
  },
  {
    id: 'pdf-reader',
    label: 'PDF Reader MCP',
    transport: 'stdio',
    command: 'npx',
    args: ['@sylphx/pdf-reader-mcp'],
    capabilities: [
      'document.read',
      'document.search',
      'document.tables',
      'document.evidence',
      'document.ocr',
    ],
    fallbackAdapter: 'builtin-document-reader',
    notes: [
      'Use for source-backed PDF extraction when attachments contain tables, scans, or page evidence.',
      'The built-in reader remains the packaged fallback for txt/html/doc/docx/simple PDF extraction.',
    ],
  },
];

export const describeMcpToolPlans = ({
  env = process.env,
}: {
  env?: Record<string, string | undefined>;
} = {}): McpToolPlanStatus[] => DEFAULT_MCP_TOOL_PLANS.map((plan) => {
  const missingEnv = (plan.requiredEnv || []).filter((key) => !String(env[key] || '').trim());
  return {
    ...plan,
    configured: missingEnv.length === 0,
    missingEnv,
    status: missingEnv.length === 0 ? 'ready' : 'fallback',
  };
});

