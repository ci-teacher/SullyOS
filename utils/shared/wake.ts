import { sharedMutation, sharedRequest } from './sharedClient';

export interface SharedWakeSignal {
  id: string;
  reason: string;
  priority: number;
  status: 'pending' | 'processing' | 'consumed' | 'expired' | 'failed';
  payload?: Record<string, unknown>;
  createdAt: number;
  expiresAt?: number;
  consumedAt?: number;
  dedupeKey?: string;
  claimedAt?: number;
  claimExpiresAt?: number;
  resolution?: 'acted' | 'no_action' | 'failed';
  result?: Record<string, unknown>;
}

export async function peekWakeSignal(): Promise<SharedWakeSignal | null> {
  const result = await sharedRequest<{ wake: SharedWakeSignal | null }>('/v1/wake/next', { method: 'GET' });
  return result?.wake || null;
}

export async function claimWakeSignal(): Promise<SharedWakeSignal | null> {
  const result = await sharedRequest<{ wake: SharedWakeSignal | null }>('/v1/wake/claim', { method: 'POST' });
  return result?.wake || null;
}

export async function consumeWakeSignal(
  id: string,
  resolution: 'acted' | 'no_action' = 'acted',
  result?: Record<string, unknown>,
): Promise<boolean> {
  return sharedMutation(`/v1/wake/${encodeURIComponent(id)}/consume`, {
    method: 'POST',
    body: JSON.stringify({ resolution, result }),
  });
}

export async function failWakeSignal(
  id: string,
  result?: Record<string, unknown>,
): Promise<boolean> {
  return sharedMutation(`/v1/wake/${encodeURIComponent(id)}/fail`, {
    method: 'POST',
    body: JSON.stringify({ result }),
  });
}

export async function createWakeSignal(input: {
  reason: string;
  priority?: number;
  payload?: Record<string, unknown>;
  expiresAt?: number;
  dedupeKey?: string;
}): Promise<boolean> {
  return sharedMutation('/v1/wake', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
