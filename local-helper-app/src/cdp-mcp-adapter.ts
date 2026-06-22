import type {
  BrowserHarnessRuntime,
  BrowserObservation,
} from './site-harness.ts';

export type ControlledBrowserTool = {
  name: string;
  open(url: string): Promise<BrowserObservation>;
  observe(): Promise<BrowserObservation>;
  screenshot(): Promise<string>;
};

// 受控浏览器工具层：当前复用 Playwright 持久化浏览器 runtime。
// 后续若内嵌或连接 chrome-devtools-mcp，只需要替换这一层，不影响 Agent 编排。
export const createCdpMcpBrowserTool = ({
  browser,
  name = 'playwright-cdp',
}: {
  browser: BrowserHarnessRuntime;
  name?: string;
}): ControlledBrowserTool => ({
  name,
  open: (url) => browser.open(url),
  observe: () => browser.observe(),
  screenshot: async () => browser.screenshot?.() || '',
});

