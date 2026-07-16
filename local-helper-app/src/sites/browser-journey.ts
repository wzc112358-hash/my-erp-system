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
import { extractCandidatesWithLLM } from '../llm/candidate-extractor.ts';
import type { LocalLLMConfig } from '../llm/client.ts';
import type { SiteDefinition } from './registry.ts';

export type BrowserSearchJourneyResult = {
  status: 'ready' | 'request_human';
  humanReason: string;
  observation: BrowserObservation;
  candidateBundle: CandidateBundle | null;
  artifacts: LocalHelperArtifact[];
  searchedQueries: string[];
};

const cleanTitle = (value = '') => value.replace(/\s+/g, '').trim();
const splitQueries = (value = '') => value
  .split(/[,，、;；\n]+/)
  .map((item) => item.trim())
  .filter((item) => item.length >= 2);

const mergeCandidates = (candidates: TenderCandidate[]) => {
  const merged = new Map<string, TenderCandidate>();
  for (const candidate of candidates) {
    const key = `${cleanTitle(candidate.title)}|${candidate.url}`;
    const current = merged.get(key);
    merged.set(key, current ? {
      ...current,
      ...candidate,
      raw_text: candidate.raw_text.length >= current.raw_text.length ? candidate.raw_text : current.raw_text,
      attachments: [...new Set([...current.attachments, ...candidate.attachments])],
      browser_ref: current.browser_ref || candidate.browser_ref,
      search_query: current.search_query || candidate.search_query,
      notice_type: current.notice_type || candidate.notice_type,
    } : candidate);
  }
  return [...merged.values()];
};

const candidateIsRecent = (candidate: TenderCandidate, recentDays: number, now: Date) => {
  if (!candidate.published_at || recentDays <= 0) return true;
  const published = Date.parse(`${candidate.published_at.slice(0, 10)}T23:59:59+08:00`);
  if (!Number.isFinite(published)) return true;
  return published >= now.getTime() - recentDays * 24 * 60 * 60 * 1000;
};

const uniqueArtifacts = (artifacts: LocalHelperArtifact[]) => artifacts.filter((artifact, index, all) => (
  index === all.findIndex((item) => `${item.artifact_type}|${item.title}|${item.url || ''}` === `${artifact.artifact_type}|${artifact.title}|${artifact.url || ''}`)
));

export const runBrowserSearchJourney = async ({
  task,
  browser,
  definition,
  llmConfig = null,
  llmCandidateExtractor = extractCandidatesWithLLM,
  now = new Date(),
}: {
  task: LocalHelperTask;
  browser: BrowserSession;
  definition: SiteDefinition;
  llmConfig?: LocalLLMConfig | null;
  llmCandidateExtractor?: typeof extractCandidatesWithLLM;
  now?: Date;
}): Promise<BrowserSearchJourneyResult> => {
  const journey = definition.browserJourney;
  let observation = await browser.open(task.entryUrl || definition.entryUrl || '');
  const artifacts: LocalHelperArtifact[] = [];
  const candidates: TenderCandidate[] = [];
  const searchedQueries: string[] = [];

  const collect = async (current: BrowserObservation) => {
    artifacts.push(...buildObservationArtifacts(current, task));
    const deterministic = extractCandidateBundle(current, task, definition);
    // Structured rows are more faithful than an LLM reconstruction. The model
    // recovers candidates only when the site exposes no usable list structure;
    // the business assessor still evaluates every candidate later in the flow.
    const llm = deterministic.candidates.length === 0
      ? await llmCandidateExtractor({ task, observation: current, config: llmConfig }).catch(() => null)
      : null;
    candidates.push(...deterministic.candidates, ...(llm?.candidates || []));
  };

  const checkHuman = (current: BrowserObservation) => {
    const analysis = analyzeObservation(current, definition);
    if (current.humanChallengeVisible || analysis.status === 'request_human') {
      return analysis.reason || '站点需要员工完成登录或安全验证。';
    }
    return '';
  };

  let humanReason = checkHuman(observation);
  if (humanReason) {
    return { status: 'request_human', humanReason, observation, candidateBundle: null, artifacts, searchedQueries };
  }
  if (!journey || journey.strategy === 'latest') {
    await collect(observation);
  } else {
    if (!browser.act) {
      return {
        status: 'request_human',
        humanReason: '当前浏览器无法执行站内搜索，请升级本地助手或由员工停留在搜索结果页。',
        observation,
        candidateBundle: null,
        artifacts,
        searchedQueries,
      };
    }
    const configured = journey.queryTerms;
    const requested = splitQueries(task.searchTerms || '');
    const queries = [...new Set(requested.length ? requested : configured)]
      .filter((query) => configured.length === 0 || configured.includes(query))
      .slice(0, Math.max(1, configured.length || 10));
    for (const query of queries) {
      const searched = await browser.act({ type: 'search', query });
      observation = searched.observation;
      searchedQueries.push(query);
      humanReason = checkHuman(observation);
      if (humanReason) {
        const recent = mergeCandidates(candidates).filter((candidate) => candidateIsRecent(candidate, journey.recentDays, now));
        return {
          status: 'request_human', humanReason, observation,
          candidateBundle: recent.length ? { source_name: task.sourceName, candidates: recent } : null,
          artifacts: uniqueArtifacts(artifacts), searchedQueries,
        };
      }
      if (searched.performed) await collect(observation);
      for (let page = 1; page < journey.maxPages; page += 1) {
        const next = await browser.act({ type: 'next_page' });
        if (!next.performed) break;
        observation = next.observation;
        humanReason = checkHuman(observation);
        if (humanReason) break;
        await collect(observation);
      }
      if (humanReason) break;
    }
  }

  const recentDays = journey?.recentDays || 0;
  const recent = mergeCandidates(candidates)
    .filter((candidate) => candidateIsRecent(candidate, recentDays, now))
    .slice(0, definition.maxCandidates || 100);
  return {
    status: humanReason ? 'request_human' : 'ready',
    humanReason,
    observation,
    candidateBundle: recent.length ? { source_name: task.sourceName, candidates: recent } : null,
    artifacts: uniqueArtifacts(artifacts),
    searchedQueries,
  };
};
