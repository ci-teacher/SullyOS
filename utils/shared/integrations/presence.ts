import type { SharedSession, SharedSessionKind } from '../types';
import { createSharedSession, updateSharedSession } from '../domain';

export type SharedPresenceKind = Extract<SharedSessionKind, 'reading' | 'movie' | 'listening'>;

export interface SharedPresencePayload {
  resourceRef?: string;
  subtitle?: string;
  position?: number;
  duration?: number;
  chapter?: string;
  state?: 'idle' | 'playing' | 'paused' | 'finished';
  note?: string;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export async function createSharedPresenceSession(input: {
  kind: SharedPresenceKind;
  title: string;
  resourceRef?: string;
  metadata?: Record<string, unknown>;
}): Promise<SharedSession> {
  return createSharedSession({
    kind: input.kind,
    title: input.title,
    payload: {
      resourceRef: input.resourceRef,
      state: 'idle',
      updatedAt: Date.now(),
      metadata: input.metadata,
    } satisfies SharedPresencePayload,
  });
}

export async function updateSharedPresence(
  session: SharedSession,
  updates: Partial<Omit<SharedPresencePayload, 'updatedAt'>>,
): Promise<SharedSession> {
  const payload = {
    ...(session.payload as unknown as SharedPresencePayload),
    ...updates,
    updatedAt: Date.now(),
  } satisfies SharedPresencePayload;

  const completed = payload.state === 'finished';
  return updateSharedSession(session, {
    status: completed ? 'completed' : 'active',
    payload: payload as unknown as Record<string, unknown>,
  });
}
