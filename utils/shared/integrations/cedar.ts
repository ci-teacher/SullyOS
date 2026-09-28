import type { SharedSession } from '../types';
import { createSharedSession, updateSharedSession } from '../domain';

export interface CedarPublicSnapshot {
  roomId?: string;
  gameType: string;
  revision?: number;
  currentActor?: string;
  participants?: Array<{
    id: string;
    displayName?: string;
    seat?: number;
    role?: string;
  }>;
  publicState?: Record<string, unknown>;
  legalActions?: unknown[];
  lastEvent?: Record<string, unknown>;
  updatedAt?: number;
}

export interface CedarSessionPayload {
  integration: 'cedarduet';
  serviceMode: 'self_hosted' | 'official';
  serviceBase?: string;
  roomId?: string;
  gameType: string;
  revision?: number;
  currentActor?: string;
  publicState?: Record<string, unknown>;
  legalActions?: unknown[];
  participants?: CedarPublicSnapshot['participants'];
  lastEvent?: Record<string, unknown>;
  lastSyncedAt?: number;
}

/**
 * Shared-phone only stores public / viewer-safe state.
 * Hidden cards, dice, identities, or other private_state stay authoritative in CedarDuet.
 */
export async function createCedarSession(input: {
  title?: string;
  gameType: string;
  roomId?: string;
  serviceMode?: 'self_hosted' | 'official';
  serviceBase?: string;
}): Promise<SharedSession> {
  return createSharedSession({
    kind: 'cedar',
    title: input.title || input.gameType,
    payload: {
      integration: 'cedarduet',
      serviceMode: input.serviceMode || 'self_hosted',
      serviceBase: input.serviceBase,
      roomId: input.roomId,
      gameType: input.gameType,
      lastSyncedAt: Date.now(),
    } satisfies CedarSessionPayload,
  });
}

export async function applyCedarPublicSnapshot(
  session: SharedSession,
  snapshot: CedarPublicSnapshot,
): Promise<SharedSession> {
  const current = (session.payload || {}) as unknown as CedarSessionPayload;
  const payload: CedarSessionPayload = {
    ...current,
    integration: 'cedarduet',
    gameType: snapshot.gameType || current.gameType,
    roomId: snapshot.roomId || current.roomId,
    revision: snapshot.revision,
    currentActor: snapshot.currentActor,
    participants: snapshot.participants,
    publicState: snapshot.publicState,
    legalActions: snapshot.legalActions,
    lastEvent: snapshot.lastEvent,
    lastSyncedAt: snapshot.updatedAt || Date.now(),
  };

  return updateSharedSession(session, { payload: payload as unknown as Record<string, unknown> });
}

export async function pauseCedarSession(session: SharedSession): Promise<SharedSession> {
  return updateSharedSession(session, { status: 'paused' });
}

export async function finishCedarSession(
  session: SharedSession,
  result?: Record<string, unknown>,
): Promise<SharedSession> {
  const payload = {
    ...session.payload,
    result,
    finishedAt: Date.now(),
  };
  return updateSharedSession(session, { status: 'completed', payload });
}
