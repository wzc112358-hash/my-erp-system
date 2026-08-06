const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateParts = (formatter: Intl.DateTimeFormat, date: Date) => {
  const parts = formatter.formatToParts(date);
  return {
    year: parts.find((part) => part.type === 'year')?.value,
    month: parts.find((part) => part.type === 'month')?.value,
    day: parts.find((part) => part.type === 'day')?.value,
  };
};

/**
 * Resolve a PocketBase date to the calendar month used by the business.
 * PocketBase stores datetimes in UTC, while contracts are managed in China time.
 */
export const businessMonthKey = (value: string | undefined) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  const date = new Date(rawValue);
  if (!Number.isNaN(date.getTime())) {
    const { year, month } = dateParts(monthFormatter, date);
    if (year && month) return `${year}-${month}`;
  }

  const fallback = rawValue.match(/^(\d{4})-(\d{2})/);
  return fallback ? `${fallback[1]}-${fallback[2]}` : '';
};

export const businessDateLabel = (value: string | undefined) => {
  const rawValue = String(value || '').trim();
  const date = new Date(rawValue);
  if (!Number.isNaN(date.getTime())) {
    const { year, month, day } = dateParts(dateFormatter, date);
    if (year && month && day) return `${year}-${month}-${day}`;
  }
  return rawValue.slice(0, 10) || '-';
};

/** UTC boundaries corresponding to Jan 1, 00:00 in Asia/Shanghai. */
export const businessYearUtcRange = (year: number) => ({
  start: new Date(`${year}-01-01T00:00:00+08:00`).toISOString(),
  end: new Date(`${year + 1}-01-01T00:00:00+08:00`).toISOString(),
});
