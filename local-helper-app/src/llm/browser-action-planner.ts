import type {
  BrowserAction,
  BrowserObservation,
  LocalHelperTask,
} from '../browser/types.ts';
import {
  callOpenAICompatibleChatCompletion,
  resolveLLMSettings,
  type LocalLLMConfig,
} from './client.ts';

export type BrowserActionGoal = 'expose_human_challenge';

export type BrowserActionPlanner = (input: {
  goal: BrowserActionGoal;
  task: LocalHelperTask;
  observation: BrowserObservation;
  config?: LocalLLMConfig | null;
}) => Promise<BrowserAction | null>;

const jsonObjectFrom = (content = '') => {
  const clean = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const planBrowserActionWithLLM: BrowserActionPlanner = async ({
  goal,
  task,
  observation,
  config = null,
}) => {
  const settings = resolveLLMSettings({ config });
  if (!settings.enabled || !settings.apiKey) return null;
  const interactives = (observation.interactiveElements || []).slice(0, 100);
  const result = await callOpenAICompatibleChatCompletion({
    config,
    temperature: 0,
    maxTokens: 240,
    responseFormatJson: true,
    messages: [
      {
        role: 'system',
        content: [
          '你是受约束的浏览器导航 Agent，只能选择页面中已经观察到的元素。',
          '目标是把流程推进到可见的人机验证页面，绝不能尝试识别、绕过或代替员工完成验证码。',
          '优先点击真实招标/采购公告标题，不得点击登录、广告、机构主页、增值服务或结果统计。',
          '只返回 JSON：{"type":"click","elementId":"hcz-1"}；没有合适元素则返回 {"type":"click_first_notice"}。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          goal,
          sourceName: task.sourceName,
          currentUrl: observation.url,
          visibleText: observation.visibleText.slice(0, 4_000),
          interactiveElements: interactives,
        }),
      },
    ],
  });
  const parsed = jsonObjectFrom(result.content);
  if (parsed?.type === 'click') {
    const elementId = String(parsed.elementId || '');
    if (interactives.some((element) => element.id === elementId)) {
      return { type: 'click', elementId };
    }
  }
  return { type: 'click_first_notice' };
};
