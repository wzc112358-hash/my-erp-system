export const pruneExpiredAndLimit = <T extends { expiresAt: number }>(
  cache: Map<string, T>,
  limit: number,
  now = Date.now(),
) => {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
};
