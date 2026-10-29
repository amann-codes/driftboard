const FALLBACK = '/';

export function safeReturnPath(candidate: string | null, fallback = FALLBACK) {
  if (!candidate) return fallback;
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return fallback;
  try {
    const url = new URL(candidate, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function currentReturnPath(fallback = FALLBACK) {
  if (typeof window === 'undefined') return fallback;
  return safeReturnPath(new URLSearchParams(window.location.search).get('next'), fallback);
}

export function withReturnPath(path: string, returnTo: string) {
  if (!returnTo || returnTo === FALLBACK) return path;
  return `${path}?next=${encodeURIComponent(returnTo)}`;
}
