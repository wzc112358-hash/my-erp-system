export type LocalScheduleRunMode = 'agent' | 'open_browser' | 'create_task_only';

export type LocalScheduleRunStatus =
  'created'
  | 'request_human'
  | 'completed'
  | 'failed'
  | 'skipped';

export type LocalSchedule = {
  id: string;
  sourceName: string;
  searchTerms: string;
  entryUrl: string;
  actionSteps: string;
  times: string[];
  enabled: boolean;
  runMode: LocalScheduleRunMode;
  lastRunKey?: string;
  lastRunAt?: string;
  lastTaskId?: string;
  lastStatus?: LocalScheduleRunStatus;
  updatedAt?: string;
};

export type LocalScheduleInput = Partial<LocalSchedule> & {
  times?: string[] | string;
};

export type DueSchedule = {
  schedule: LocalSchedule;
  runKey: string;
  scheduledTime: string;
};

const RUN_MODES = new Set<LocalScheduleRunMode>(['agent', 'open_browser', 'create_task_only']);

const normalizeTime = (value = '') => {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return '';
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const parseScheduleTimes = (input: string[] | string | undefined) => {
  const raw = Array.isArray(input)
    ? input
    : String(input || '').split(/[,\s，、;；]+/);
  return [...new Set(raw.map((item) => normalizeTime(String(item))).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
};

const dateLabel = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const currentMinutes = (date = new Date()) => date.getHours() * 60 + date.getMinutes();

const minutesForTime = (time = '') => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

export const scheduleRunKey = (date: Date, scheduledTime: string) => (
  `${dateLabel(date)} ${scheduledTime}`
);

export const normalizeSchedule = (
  input: LocalScheduleInput = {},
  fallbackId = '',
): LocalSchedule => {
  const id = String(input.id || fallbackId || `schedule-${Date.now()}`).trim();
  const times = parseScheduleTimes(input.times || '09:00');
  const runMode = RUN_MODES.has(input.runMode as LocalScheduleRunMode)
    ? input.runMode as LocalScheduleRunMode
    : 'agent';
  return {
    id,
    sourceName: String(input.sourceName || '').trim(),
    searchTerms: String(input.searchTerms || '').trim(),
    entryUrl: String(input.entryUrl || '').trim(),
    actionSteps: String(input.actionSteps || '').trim(),
    times: times.length ? times : ['09:00'],
    enabled: input.enabled !== false,
    runMode,
    lastRunKey: input.lastRunKey || '',
    lastRunAt: input.lastRunAt || '',
    lastTaskId: input.lastTaskId || '',
    lastStatus: input.lastStatus,
    updatedAt: input.updatedAt || '',
  };
};

export const dueScheduleFor = (
  schedule: LocalSchedule,
  {
    now = new Date(),
    windowMinutes = 10,
  }: {
    now?: Date;
    windowMinutes?: number;
  } = {},
): DueSchedule | null => {
  if (!schedule.enabled) return null;
  if (!schedule.sourceName.trim()) return null;
  const current = currentMinutes(now);
  const scheduledTime = schedule.times.find((time) => (
    Math.abs(current - minutesForTime(time)) <= windowMinutes
  ));
  if (!scheduledTime) return null;
  const runKey = scheduleRunKey(now, scheduledTime);
  if (schedule.lastRunKey === runKey) return null;
  return {
    schedule,
    runKey,
    scheduledTime,
  };
};

export const dueSchedulesFor = (
  schedules: LocalSchedule[],
  options: {
    now?: Date;
    windowMinutes?: number;
  } = {},
) => schedules
  .map((schedule) => dueScheduleFor(schedule, options))
  .filter((item): item is DueSchedule => Boolean(item));
