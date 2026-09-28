const RAW_BASE = String(import.meta.env.VITE_SHARED_API_BASE || '').trim();
const SHARED_API_BASE = RAW_BASE.replace(/\/+$/, '');
const SHARED_API_TOKEN = String(import.meta.env.VITE_SHARED_API_TOKEN || '').trim();

export function isSharedApiEnabled(): boolean {
  return SHARED_API_BASE.length > 0;
}

export function getSharedApiBase(): string {
  return SHARED_API_BASE;
}

interface SharedRequestOptions extends RequestInit {
  timeoutMs?: number;
}

export async function sharedRequest<T>(
  path: string,
  options: SharedRequestOptions = {},
): Promise<T | null> {
  if (!isSharedApiEnabled()) return null;

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 5000;
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
    if (SHARED_API_TOKEN) headers.set('Authorization', `Bearer ${SHARED_API_TOKEN}`);

    const response = await fetch(`${SHARED_API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });

    if (!response.ok) {
      throw new Error(`shared api ${response.status}: ${response.statusText}`);
    }

    if (response.status === 204) return null;
    return await response.json() as T;
  } catch (error) {
    console.warn('[SharedPhone] request failed; keeping local data authoritative for now.', error);
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
