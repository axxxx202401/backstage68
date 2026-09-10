let lastCacheBustTimestamp = 0;

function parseHttpUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function withCacheBustingTimestamp(rawUrl, timestamp) {
  const url = parseHttpUrl(rawUrl);
  if (!url) return rawUrl;

  url.searchParams.set('_t', String(timestamp));
  return url.toString();
}

export function freshCacheBustedUrl(rawUrl, now = Date.now) {
  const url = parseHttpUrl(rawUrl);
  if (!url) return rawUrl;

  const currentTimestamp = Math.trunc(now());
  const timestamp = Math.max(currentTimestamp, lastCacheBustTimestamp + 1);
  lastCacheBustTimestamp = timestamp;
  url.searchParams.set('_t', String(timestamp));
  return url.toString();
}
