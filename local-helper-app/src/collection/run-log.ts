import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type AgentRunStatus = 'running' | 'request_human' | 'completed' | 'failed' | 'cancelled';

export type AgentHarnessRun = {
  id: string;
  taskId: string;
  sourceName: string;
  entryUrl: string;
  searchTerms?: string;
  trigger: string;
  status: AgentRunStatus;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  resultSummary?: string;
  errorMessage?: string;
};

export type AgentHarnessStepInput = {
  phase: 'plan' | 'discover' | 'browser' | 'extract' | 'assess' | 'summarize' | 'human' | 'complete' | 'error';
  action: string;
  tool?: string;
  observation?: Record<string, unknown> | string;
  result?: Record<string, unknown> | string;
  errorMessage?: string;
};

export type AgentHarnessStep = AgentHarnessStepInput & {
  runId: string;
  stepIndex: number;
  createdAt: string;
};

export type AgentHarnessRunDetail = {
  run: AgentHarnessRun;
  steps: AgentHarnessStep[];
};

export type AgentHarnessStore = ReturnType<typeof createAgentHarnessStore>;

const trimString = (value = '', limit = 6000) => (
  value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value
);

const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === 'string') return trimString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/password|apiKey|token|secret|cookie|authorization/i.test(key)) return [key, '[redacted]'];
      return [key, sanitizeValue(item)];
    }));
  }
  return value;
};

const runIdFor = () => `run-${Date.now()}-${randomUUID().slice(0, 8)}`;

export const createAgentHarnessStore = ({
  rootDir,
  now = () => new Date(),
}: {
  rootDir: string;
  now?: () => Date;
}) => {
  const stepCounters = new Map<string, number>();
  const runDir = (runId: string) => path.join(rootDir, runId);
  const runFile = (runId: string) => path.join(runDir(runId), 'run.json');
  const stepsFile = (runId: string) => path.join(runDir(runId), 'steps.jsonl');
  const timestamp = () => now().toISOString();

  const ensureRunDir = async (runId: string) => {
    await fs.mkdir(runDir(runId), { recursive: true });
  };

  const readRun = async (runId: string): Promise<AgentHarnessRun> => (
    JSON.parse(await fs.readFile(runFile(runId), 'utf8')) as AgentHarnessRun
  );

  const writeRun = async (run: AgentHarnessRun) => {
    await ensureRunDir(run.id);
    await fs.writeFile(runFile(run.id), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  };

  const nextStepIndex = async (runId: string) => {
    const current = stepCounters.get(runId);
    if (typeof current === 'number') {
      const next = current + 1;
      stepCounters.set(runId, next);
      return next;
    }
    const existing = await fs.readFile(stepsFile(runId), 'utf8').catch(() => '');
    const count = existing.trim() ? existing.trim().split('\n').length : 0;
    stepCounters.set(runId, count);
    return nextStepIndex(runId);
  };

  const updateRun = async (
    runId: string,
    patch: Partial<AgentHarnessRun>,
  ): Promise<AgentHarnessRun> => {
    const existing = await readRun(runId);
    const next = {
      ...existing,
      ...patch,
      updatedAt: timestamp(),
    };
    await writeRun(next);
    return next;
  };

  return {
    async startRun(input: {
      taskId: string;
      sourceName: string;
      entryUrl?: string;
      searchTerms?: string;
      trigger?: string;
    }): Promise<AgentHarnessRun> {
      const startedAt = timestamp();
      const run: AgentHarnessRun = {
        id: runIdFor(),
        taskId: input.taskId,
        sourceName: input.sourceName,
        entryUrl: input.entryUrl || '',
        searchTerms: input.searchTerms || '',
        trigger: input.trigger || 'manual_agent_run',
        status: 'running',
        startedAt,
        updatedAt: startedAt,
      };
      await writeRun(run);
      stepCounters.set(run.id, 0);
      return run;
    },

    async appendStep(runId: string, input: AgentHarnessStepInput): Promise<AgentHarnessStep> {
      await ensureRunDir(runId);
      const step: AgentHarnessStep = {
        ...input,
        observation: sanitizeValue(input.observation) as AgentHarnessStep['observation'],
        result: sanitizeValue(input.result) as AgentHarnessStep['result'],
        runId,
        stepIndex: await nextStepIndex(runId),
        createdAt: timestamp(),
      };
      await fs.appendFile(stepsFile(runId), `${JSON.stringify(step)}\n`, 'utf8');
      await updateRun(runId, {});
      return step;
    },

    async finishRun(runId: string, input: {
      status: AgentRunStatus;
      resultSummary?: string;
      errorMessage?: string;
    }): Promise<AgentHarnessRun> {
      return updateRun(runId, {
        status: input.status,
        resultSummary: input.resultSummary || '',
        errorMessage: input.errorMessage || '',
        finishedAt: timestamp(),
      });
    },

    async getRun(runId: string): Promise<AgentHarnessRunDetail> {
      const run = await readRun(runId);
      const stepsText = await fs.readFile(stepsFile(runId), 'utf8').catch(() => '');
      const steps = stepsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AgentHarnessStep);
      return { run, steps };
    },

    async listRuns({ limit = 50 }: { limit?: number } = {}): Promise<AgentHarnessRun[]> {
      await fs.mkdir(rootDir, { recursive: true });
      const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
      const runs = await Promise.all(entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readRun(entry.name).catch(() => null)));
      return runs
        .filter((run): run is AgentHarnessRun => Boolean(run))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, limit);
    },
  };
};
