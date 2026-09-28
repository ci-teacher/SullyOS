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


export async function sharedUploadBlob(path: string, blob: Blob): Promise<boolean> {
  if (!isSharedApiEnabled()) return false;

  const headers = new Headers();
  if (SHARED_API_TOKEN) headers.set('Authorization', `Bearer ${SHARED_API_TOKEN}`);
  if (blob.type) headers.set('Content-Type', blob.type);

  try {
    const response = await fetch(`${SHARED_API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
      method: 'PUT',
      headers,
      body: blob,
    });
    if (!response.ok) throw new Error(`shared media upload ${response.status}`);
    return true;
  } catch (error) {
    console.warn('[SharedPhone] media upload failed.', error);
    return false;
  }
}

export async function sharedRequestBlob(path: string): Promise<Blob | null> {
  if (!isSharedApiEnabled()) return null;

  const headers = new Headers();
  if (SHARED_API_TOKEN) headers.set('Authorization', `Bearer ${SHARED_API_TOKEN}`);

  try {
    const response = await fetch(`${SHARED_API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`shared media fetch ${response.status}`);
    return await response.blob();
  } catch (error) {
    console.warn('[SharedPhone] media fetch failed.', error);
    return null;
  }
}
