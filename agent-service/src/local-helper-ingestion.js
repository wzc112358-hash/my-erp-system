import {
  processCandidatesWithEnhancement,
} from './opportunity-agent.js';
import { classifyWithLlm } from './domain/llm-classifier.js';
import {
  buildOpportunityPayload,
  shouldPersistOpportunity,
} from './opportunity-persistence.js';

export const buildRawCandidatesFromCandidateBundle = ({
  bundle = {},
  task = {},
} = {}) => {
  const sourceName = bundle.source_name || bundle.sourceName || task.source_name || task.sourceName || '';
  const ownerName = task.owner_name || task.ownerName || '';
  const sourceId = task.source || task.sourceId || '';
  const sourceKeywords = task.search_terms || task.searchTerms || '';
  return (bundle.candidates || []).map((candidate) => ({
    sourceId,
    sourceName,
    ownerName,
    title: candidate.title || '',
    url: candidate.url || '',
    publishDate: candidate.published_at || candidate.publishDate || '',
    deadlineDate: candidate.deadline_at || candidate.deadlineDate || '',
    buyerName: candidate.buyer_name || candidate.buyerName || '',
    content: candidate.raw_text || candidate.rawText || candidate.content || candidate.title || '',
    attachmentUrls: candidate.attachments || candidate.attachmentUrls || [],
    sourceKeywords,
  })).filter((candidate) => candidate.title || candidate.url || candidate.content);
};

const sourceFromTask = (task = {}) => ({
  id: task.source || task.sourceId || '',
  source_name: task.source_name || task.sourceName || '',
  owner_name: task.owner_name || task.ownerName || '',
});

const monitorRunFrom = ({ task = {}, run = {} } = {}) => ({
  id: task.monitor_run || task.monitorRun || run.monitor_run || run.monitorRun || run.id || '',
});

const isRequestHumanStatusValidationError = (error) => /validation_invalid_value|Invalid value request_human/i.test(
  error instanceof Error ? error.message : String(error),
);

const updateAgentTaskAfterIngestion = async ({
  updateRecordFn,
  taskId,
  token,
  data,
}) => {
  try {
    return await updateRecordFn('agent_tasks', taskId, token, data);
  } catch (error) {
    if (data.status === 'request_human' && isRequestHumanStatusValidationError(error)) {
      return updateRecordFn('agent_tasks', taskId, token, {
        ...data,
        status: 'in_progress',
        result_summary: `${data.result_summary}\n\n系统提示：服务器状态枚举未升级，暂按“处理中”显示。`,
      });
    }
    throw error;
  }
};

export const ingestCandidateBundleArtifact = async ({
  token,
  task,
  run = {},
  candidateBundle,
  listRecordsFn,
  createRecordFn,
  updateRecordFn,
  processor = processCandidatesWithEnhancement,
  classifierEnhancer = classifyWithLlm,
} = {}) => {
  if (!token) throw new Error('token is required');
  if (!task?.id) throw new Error('agent task is required');
  if (!candidateBundle) throw new Error('candidateBundle is required');
  if (!listRecordsFn || !createRecordFn || !updateRecordFn) {
    throw new Error('record functions are required');
  }

  try {
    const rawCandidates = buildRawCandidatesFromCandidateBundle({ bundle: candidateBundle, task });
    const processed = await processor(rawCandidates, { classifierEnhancer });
    const source = sourceFromTask(task);
    const monitorRun = monitorRunFrom({ task, run });
    if (!monitorRun.id) throw new Error('monitor_run is required for local helper ingestion');

    const existing = await listRecordsFn('bid_opportunities', token);
    const existingByFingerprint = new Map(existing.map((item) => [item.fingerprint, item]));
    const created = [];

    const persistable = processed.filter(shouldPersistOpportunity);

    for (const item of persistable) {
      if (existingByFingerprint.has(item.fingerprint)) continue;
      const record = await createRecordFn('bid_opportunities', token, buildOpportunityPayload(source, monitorRun, item));
      existingByFingerprint.set(item.fingerprint, record);
      created.push(record);
    }

    const status = persistable.length > 0 ? 'completed' : 'request_human';
    const resultSummary = status === 'completed'
      ? `本地助手回灌完成：候选 ${processed.length} 条，入库 ${created.length} 条。`
      : `本地助手已采集候选 ${processed.length} 条，但没有生成可入库商机。请在本地浏览器进入具体公告列表或按搜索词筛选后再次点击继续采集。`;

    await updateAgentTaskAfterIngestion({
      updateRecordFn,
      taskId: task.id,
      token,
      data: {
        status,
        result_summary: resultSummary,
        uploaded_artifacts: run.id || '',
      },
    });

    return {
      rawCount: rawCandidates.length,
      processedCount: processed.length,
      persistableCount: persistable.length,
      createdCount: created.length,
      status,
      resultSummary,
    };
  } catch (error) {
    await updateRecordFn('agent_tasks', task.id, token, {
      status: 'failed',
      result_summary: `本地助手回灌失败：${error instanceof Error ? error.message : String(error)}`,
      uploaded_artifacts: run.id || '',
    }).catch(() => null);
    throw error;
  }
};
