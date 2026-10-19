// Small fetch wrapper. Cookies (the Better Auth session) are sent cross-port with credentials: 'include'.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

// Device id: stable per browser, used as the HLC node id and in each op's clientId.
export function deviceId(): string {
  let id = localStorage.getItem('driftboard.device');
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    localStorage.setItem('driftboard.device', id);
  }
  return id;
}

// Last known /api/me response, so the app knows who you are while offline.
export function cachedMe(): any | null {
  try {
    return JSON.parse(localStorage.getItem('driftboard.me') ?? 'null');
  } catch {
    return null;
  }
}
export function saveMe(me: unknown) {
  localStorage.setItem('driftboard.me', JSON.stringify(me));
}
