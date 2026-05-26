import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLlmClassifierPayload,
  classifyWithLlm,
  normalizeLlmClassification,
} from './llm-classifier.js';

const candidate = {
  sourceName: '裕龙招投标网',
  ownerName: '小白',
  title: '缓蚀阻垢剂采购公告',
  url: 'https://example.com/notice/1',
  buyerName: '裕龙石化',
  deadlineDate: '2026-06-05',
  rawText: '本项目接受代理商投标，需第三方检测报告。',
};

const ruleClassification = {
  relevance: 'needs_manual_review',
  relevanceScore: 0.55,
  confidence: 0.55,
  matchedTerms: ['缓蚀阻垢剂'],
  matchedSources: ['curated'],
  evidenceText: '缓蚀阻垢剂采购公告',
  negativeTerms: [],
  needsHumanCheck: true,
  productKeywords: ['缓蚀阻垢剂'],
  hardRequirements: ['第三方检测'],
  riskFlags: ['需第三方检测'],
  summary: '疑似产品：缓蚀阻垢剂',
  classificationVersion: 'chemical-relevance-v1',
};

test('buildLlmClassifierPayload sends candidate text and rule evidence', () => {
  const payload = buildLlmClassifierPayload(candidate, ruleClassification);

  assert.equal(payload.task, 'classify_bid_opportunity');
  assert.equal(payload.candidate.title, '缓蚀阻垢剂采购公告');
  assert.equal(payload.candidate.raw_text, '本项目接受代理商投标，需第三方检测报告。');
  assert.equal(payload.rule_classification.relevance, 'needs_manual_review');
  assert.deepEqual(payload.allowed_relevance, ['likely_related', 'needs_manual_review', 'irrelevant']);
});

test('normalizeLlmClassification accepts structured LLM output and clamps score', () => {
  const normalized = normalizeLlmClassification({
    relevance: 'likely_related',
    relevance_score: 1.2,
    confidence: 0.91,
    product_keywords: ['缓蚀阻垢剂', '阻垢剂'],
    hard_requirements: ['允许代理商投标', '第三方检测'],
    risk_flags: ['需第三方检测'],
    summary: 'LLM 判断为化工助剂采购。',
    evidence_text: '需第三方检测报告',
    needs_human_check: false,
  }, ruleClassification);

  assert.equal(normalized.relevance, 'likely_related');
  assert.equal(normalized.relevanceScore, 1);
  assert.equal(normalized.confidence, 0.91);
  assert.deepEqual(normalized.productKeywords, ['缓蚀阻垢剂', '阻垢剂']);
  assert.equal(normalized.classificationVersion, 'chemical-relevance-v1+llm');
});

test('classifyWithLlm skips calls when url is empty', async () => {
  const result = await classifyWithLlm(candidate, ruleClassification, {
    llmClassifierUrl: '',
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });

  assert.equal(result, null);
});

test('classifyWithLlm posts payload and normalizes response', async () => {
  const requests = [];
  const result = await classifyWithLlm(candidate, ruleClassification, {
    llmClassifierUrl: 'https://llm.example.com/classify/',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          relevance: 'likely_related',
          relevance_score: 0.88,
          confidence: 0.84,
          product_keywords: ['缓蚀阻垢剂'],
          hard_requirements: ['第三方检测'],
          risk_flags: ['需第三方检测'],
          summary: 'LLM 判断为相关化工品商机。',
          evidence_text: '缓蚀阻垢剂采购公告',
          needs_human_check: false,
        }),
      };
    },
  });

  assert.equal(requests[0].url, 'https://llm.example.com/classify');
  assert.equal(JSON.parse(requests[0].options.body).candidate.title, '缓蚀阻垢剂采购公告');
  assert.equal(result.relevance, 'likely_related');
  assert.equal(result.classificationVersion, 'chemical-relevance-v1+llm');
});

test('classifyWithLlm returns null on HTTP or schema failure', async () => {
  const failedHttp = await classifyWithLlm(candidate, ruleClassification, {
    llmClassifierUrl: 'https://llm.example.com/classify',
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'down',
    }),
  });
  const invalidSchema = await classifyWithLlm(candidate, ruleClassification, {
    llmClassifierUrl: 'https://llm.example.com/classify',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ relevance: 'maybe' }),
    }),
  });

  assert.equal(failedHttp, null);
  assert.equal(invalidSchema, null);
});
