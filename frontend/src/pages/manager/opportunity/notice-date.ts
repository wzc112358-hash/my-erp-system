const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

const businessDate = (value: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(value);

export const isNewToday = (firstSeenAt: string, now = new Date()) => {
  const firstSeen = new Date(firstSeenAt);
  return Boolean(firstSeenAt)
    && !Number.isNaN(firstSeen.getTime())
    && businessDate(firstSeen) === businessDate(now);
};
