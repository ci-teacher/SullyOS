import { isSharedApiEnabled, sharedMutation } from './sharedClient';

export interface SharedQueuedMutation {
  id: string;
  path: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body?: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
}

const QUEUE_KEY = 'shared_phone_mutation_queue_v1';
const MAX_QUEUE = 300;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

let flushing = false;
let installed = false;
let timer: number | null = null;

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `shared-op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readQueue(): SharedQueuedMutation[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as SharedQueuedMutation[];
  } catch {
    return [];
  }
}

function writeQueue(items: SharedQueuedMutation[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  } catch {
    // Queue persistence is best-effort and must never block a user action.
  }
}

function backoffMs(attempts: number): number {
  const base = 15_000;
  return Math.min(MAX_BACKOFF_MS, base * (2 ** Math.min(attempts, 8)));
}

export function getSharedMutationQueue(): SharedQueuedMutation[] {
  return readQueue();
}

export function getSharedMutationQueueSize(): number {
  return readQueue().length;
}

export function enqueueSharedMutation(
  path: string,
  method: SharedQueuedMutation['method'],
  body?: string,
): void {
  const items = readQueue();
  const now = Date.now();

  // Keep only the newest PUT/DELETE for the same resource path.
  const collapsed = items.filter(item => {
    if (item.path !== path) return true;
    return !(method === 'PUT' || method === 'DELETE');
  });

  collapsed.push({
    id: makeId(),
    path,
    method,
    body,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
  });

  writeQueue(collapsed);
}

export async function mutateSharedOrQueue(
  path: string,
  options: { method: SharedQueuedMutation['method']; body?: string; timeoutMs?: number },
): Promise<boolean> {
  const ok = await sharedMutation(path, options);
  if (!ok) enqueueSharedMutation(path, options.method, options.body);
  return ok;
}

export async function flushSharedMutationQueue(): Promise<void> {
  if (flushing || !isSharedApiEnabled()) return;
  flushing = true;

  try {
    const now = Date.now();
    const source = readQueue();
    const remaining: SharedQueuedMutation[] = [];

    for (const item of source) {
      if (item.nextAttemptAt > now) {
        remaining.push(item);
        continue;
      }

      const ok = await sharedMutation(item.path, {
        method: item.method,
        body: item.body,
        timeoutMs: 5000,
      });

      if (!ok) {
        const attempts = item.attempts + 1;
        remaining.push({
          ...item,
          attempts,
          nextAttemptAt: Date.now() + backoffMs(attempts),
        });
      }
    }

    writeQueue(remaining);
  } finally {
    flushing = false;
  }
}

export function installSharedMutationQueue(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const flush = () => { void flushSharedMutationQueue(); };
  window.addEventListener('online', flush);
  window.addEventListener('focus', flush);

  timer = window.setInterval(flush, 60_000);
  flush();
}

export function uninstallSharedMutationQueue(): void {
  if (!installed || typeof window === 'undefined') return;
  installed = false;
  window.removeEventListener('online', () => { void flushSharedMutationQueue(); });
  window.removeEventListener('focus', () => { void flushSharedMutationQueue(); });
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}
