import type { CandidateBundle, PublicCollectionTask, TenderCandidate } from '../domain/collection.ts';
import { buildScreenedNotices, type ScreenedNotice } from '../domain/tender-screening.ts';
import { assessScreenedNotices, createDefaultBidAssessor, type BidAssessor } from '../llm/bid-assessor.ts';
import {
  collectSitePublicFeed,
  publicDocumentEvidencePolicyFor,
  type SitePublicFeedResult,
} from '../sites/public-collectors.ts';
import type { PublicSiteDefinition } from '../domain/collection.ts';
import { readCandidateDocuments, type DocumentEvidence } from '../infrastructure/document-reader.ts';
import { buildBidCollectionReport } from './collection-report.ts';

const actionPriority = (card: ScreenedNotice) => ({
  prioritize: 4,
  deep_read: 3,
  manual_review: 2,
  track_deadline: 1,
  ignore: 0,
}[card.recommendedAction]);

const isRelevant = (card: ScreenedNotice) => card.recommendedAction !== 'ignore'
  || ['known_product', 'potential_product'].includes(card.businessRelevance || '');

const evidenceText = (documents: DocumentEvidence[]) => documents
  .filter((document) => document.text)
  .map((document) => `【${document.title}】\n${document.text}`)
  .join('\n\n');

const enrichCandidate = async ({
  candidate,
  detailReader,
  env,
  fetchImpl,
}: {
  candidate: TenderCandidate;
  detailReader?: (input: { candidate: TenderCandidate }) => Promise<TenderCandidate>;
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
}) => {
  let detailed = candidate;
  let detailWarning = '';
  if (detailReader) {
    try {
      detailed = await detailReader({ candidate });
    } catch (error) {
      detailWarning = `详情读取失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const documents = await readCandidateDocuments({ candidate: detailed, env, fetchImpl, maxDocuments: 2 });
  if (detailWarning) documents.push({ title: detailed.title, url: detailed.url, text: '', warning: detailWarning });
  const body = evidenceText(documents);
  return {
    candidate: body ? { ...detailed, raw_text: `${body}\n\n${detailed.raw_text}`.slice(0, 30_000) } : detailed,
    documents,
  };
};

export type SiteCollectionOutput = {
  feed: SitePublicFeedResult;
  bundle: CandidateBundle | null;
  cards: ScreenedNotice[];
  report: ReturnType<typeof buildBidCollectionReport>;
};

export const collectPublicSite = async ({
  site,
  task,
  assessor = createDefaultBidAssessor(),
  env = process.env,
  fetchImpl = fetch,
}: {
  site: PublicSiteDefinition;
  task: PublicCollectionTask;
  assessor?: BidAssessor;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<SiteCollectionOutput> => {
  const feed = await collectSitePublicFeed({ task, fetchImpl });
  const bundle = feed.candidateBundle;
  if (!bundle?.candidates.length) {
    return {
      feed,
      bundle: null,
      cards: [],
      report: buildBidCollectionReport({
        sourceKey: site.sourceKey,
        sourceName: site.sourceName,
        cards: [],
        discoveryStats: feed.discoveryStats,
      }),
    };
  }

  const preliminary = await assessScreenedNotices({
    task,
    bundle,
    cards: buildScreenedNotices({ bundle, task }),
    assessor,
    mode: 'screen',
  });
  const policy = publicDocumentEvidencePolicyFor(site.sourceName);
  const selectedIndexes = preliminary
    .map((card, index) => ({ card, index, candidate: bundle.candidates[index] }))
    .filter(({ card }) => isRelevant(card))
    .sort((left, right) => (
      actionPriority(right.card) - actionPriority(left.card)
      || right.card.relevanceScore - left.card.relevanceScore
      || String(right.candidate.published_at).localeCompare(String(left.candidate.published_at))
    ))
    .slice(0, policy.enabled ? site.browserJourney?.maxDetails || 6 : 0)
    .map(({ index }) => index);

  const candidates = bundle.candidates.map((candidate) => ({ ...candidate, attachments: [...candidate.attachments] }));
  const documentsByIndex = new Map<number, DocumentEvidence[]>();
  for (const index of selectedIndexes) {
    const enriched = await enrichCandidate({
      candidate: candidates[index],
      detailReader: policy.candidateDetailReader,
      env,
      fetchImpl,
    });
    candidates[index] = enriched.candidate;
    documentsByIndex.set(index, enriched.documents);
  }

  const cards = [...preliminary];
  const assessmentIndexes = preliminary
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => isRelevant(card))
    .map(({ index }) => index);
  if (assessmentIndexes.length) {
    const assessmentBundle: CandidateBundle = {
      source_name: bundle.source_name,
      candidates: assessmentIndexes.map((index) => candidates[index]),
    };
    const deterministicCards = buildScreenedNotices({ bundle: assessmentBundle, task });
    const assessmentBaseCards = deterministicCards.map((card, index) => {
      const preliminaryCard = preliminary[assessmentIndexes[index]];
      if (!preliminaryCard) return card;
      const matchedTerms = [...new Set([...card.matchedTerms, ...preliminaryCard.matchedTerms])];
      return {
        ...card,
        matchedTerms,
        matchedSources: [...new Set([...card.matchedSources, ...preliminaryCard.matchedSources])],
        relevanceScore: Math.max(card.relevanceScore, preliminaryCard.relevanceScore),
        businessRelevance: preliminaryCard.businessRelevance,
        bidability: preliminaryCard.bidability,
        recommendedAction: preliminaryCard.recommendedAction,
        evidenceText: preliminaryCard.evidenceText || card.evidenceText,
        confidence: Math.max(card.confidence, preliminaryCard.confidence),
        businessAssessment: {
          ...card.businessAssessment,
          productSummary: matchedTerms.join('、') || card.businessAssessment.productSummary,
        },
      };
    });
    const assessedCards = await assessScreenedNotices({
      task,
      bundle: assessmentBundle,
      cards: assessmentBaseCards,
      assessor,
      mode: 'detail',
    });
    assessmentIndexes.forEach((originalIndex, assessmentIndex) => {
      const card = assessedCards[assessmentIndex];
      if (!card) return;
      const documents = documentsByIndex.get(originalIndex) || [];
      const useful = documents.filter((document) => document.text);
      cards[originalIndex] = {
        ...card,
        ...(useful.length ? { deepReadAt: new Date().toISOString() } : {}),
        detailUrl: candidates[originalIndex].url,
        ...(documents.length ? {
          documentSummaries: documents.map((document) => ({
            title: document.title,
            url: document.url,
            textSnippet: document.text.slice(0, 1_200),
            warning: document.warning,
            ocrProvider: document.readMethod === '百度 OCR' ? 'baidu' : undefined,
          })),
          missingInfo: useful.length
            ? card.missingInfo
            : [...new Set([...card.missingInfo, '详情或附件未读取到有效正文'])],
        } : {}),
      };
    });
  }

  const detailedBundle = { ...bundle, candidates };
  return {
    feed,
    bundle: detailedBundle,
    cards,
    report: buildBidCollectionReport({
      sourceKey: site.sourceKey,
      sourceName: site.sourceName,
      cards,
      discoveryStats: feed.discoveryStats,
    }),
  };
};
