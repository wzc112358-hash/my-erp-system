import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dueScheduleFor,
  dueSchedulesFor,
  normalizeSchedule,
  parseScheduleTimes,
} from './local-scheduler.ts';

test('parseScheduleTimes normalizes common time input', () => {
  assert.deepEqual(parseScheduleTimes('9:0, 15:30，25:99 09:00'), ['09:00', '15:30']);
  assert.deepEqual(parseScheduleTimes(['8:5', '08:05', '18:00']), ['08:05', '18:00']);
});

test('dueScheduleFor runs inside window and skips repeated run key', () => {
  const now = new Date('2026-06-22T09:06:00+08:00');
  const schedule = normalizeSchedule({
    id: 's1',
    sourceName: '能源一号',
    times: '09:00,15:00',
  });
  const due = dueScheduleFor(schedule, { now, windowMinutes: 10 });

  assert.equal(due?.scheduledTime, '09:00');
  assert.equal(due?.runKey, '2026-06-22 09:00');
  assert.equal(dueScheduleFor({ ...schedule, lastRunKey: due?.runKey }, { now, windowMinutes: 10 }), null);
});

test('dueSchedulesFor ignores disabled and out-of-window schedules', () => {
  const now = new Date('2026-06-22T09:06:00+08:00');
  const due = dueSchedulesFor([
    normalizeSchedule({ id: 's1', sourceName: '能源一号', times: '09:00' }),
    normalizeSchedule({ id: 's2', sourceName: '华锦兵器网', times: '12:00' }),
    normalizeSchedule({ id: 's3', sourceName: '易派克', times: '09:00', enabled: false }),
  ], { now, windowMinutes: 10 });

  assert.equal(due.length, 1);
  assert.equal(due[0].schedule.id, 's1');
});
