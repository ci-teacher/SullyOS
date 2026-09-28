import type { SharedSession } from '../types';
import { createSharedSession, updateSharedSession } from '../domain';

export interface CocVisibleClue {
  id: string;
  title: string;
  summary?: string;
  obtainedAt: number;
}

export interface CocVisibleHandout {
  id: string;
  title: string;
  text?: string;
  mediaId?: string;
  revealedAt: number;
}

export interface CocLogItem {
  id: string;
  at: number;
  kind: 'scene' | 'roll' | 'clue' | 'handout' | 'note' | 'state';
  text: string;
  payload?: Record<string, unknown>;
}

export interface CocSessionPayload {
  integration: 'coc-kp-host';
  scenarioTitle?: string;
  investigator?: {
    name: string;
    occupation?: string;
    hp?: number;
    san?: number;
    luck?: number;
    [key: string]: unknown;
  };
  party?: Array<Record<string, unknown>>;
  scene?: string;
  currentLocation?: string;
  visibleClues: CocVisibleClue[];
  visibleHandouts: CocVisibleHandout[];
  musicCue?: {
    label?: string;
    url?: string;
    state?: 'playing' | 'muted' | 'stopped';
  };
  log: CocLogItem[];
  /**
   * Opaque pointer only. Never put KP-only prep, monster stats, hidden routes,
   * future events, or unrevealed handouts into the shared session payload.
   */
  kpPrivateRef?: string;
}

function payloadOf(session: SharedSession): CocSessionPayload {
  const raw = session.payload as Partial<CocSessionPayload>;
  return {
    integration: 'coc-kp-host',
    scenarioTitle: raw.scenarioTitle,
    investigator: raw.investigator,
    party: raw.party || [],
    scene: raw.scene,
    currentLocation: raw.currentLocation,
    visibleClues: raw.visibleClues || [],
    visibleHandouts: raw.visibleHandouts || [],
    musicCue: raw.musicCue,
    log: raw.log || [],
    kpPrivateRef: raw.kpPrivateRef,
  };
}

function id(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createCocSession(input: {
  title?: string;
  scenarioTitle?: string;
  investigator?: CocSessionPayload['investigator'];
  party?: CocSessionPayload['party'];
  kpPrivateRef?: string;
}): Promise<SharedSession> {
  return createSharedSession({
    kind: 'coc',
    title: input.title || input.scenarioTitle || 'COC',
    payload: {
      integration: 'coc-kp-host',
      scenarioTitle: input.scenarioTitle,
      investigator: input.investigator,
      party: input.party || [],
      visibleClues: [],
      visibleHandouts: [],
      log: [],
      kpPrivateRef: input.kpPrivateRef,
    } satisfies CocSessionPayload,
  });
}

export async function appendCocLog(
  session: SharedSession,
  item: Omit<CocLogItem, 'id' | 'at'> & { id?: string; at?: number },
): Promise<SharedSession> {
  const payload = payloadOf(session);
  payload.log = [
    ...payload.log,
    {
      ...item,
      id: item.id || id('coc-log'),
      at: item.at || Date.now(),
    },
  ].slice(-500);

  return updateSharedSession(session, { payload: payload as unknown as Record<string, unknown> });
}

export async function revealCocClue(
  session: SharedSession,
  clue: Omit<CocVisibleClue, 'obtainedAt'> & { obtainedAt?: number },
): Promise<SharedSession> {
  const payload = payloadOf(session);
  const next: CocVisibleClue = { ...clue, obtainedAt: clue.obtainedAt || Date.now() };
  payload.visibleClues = [...payload.visibleClues.filter(item => item.id !== next.id), next];
  return updateSharedSession(session, { payload: payload as unknown as Record<string, unknown> });
}

export async function revealCocHandout(
  session: SharedSession,
  handout: Omit<CocVisibleHandout, 'revealedAt'> & { revealedAt?: number },
): Promise<SharedSession> {
  const payload = payloadOf(session);
  const next: CocVisibleHandout = { ...handout, revealedAt: handout.revealedAt || Date.now() };
  payload.visibleHandouts = [...payload.visibleHandouts.filter(item => item.id !== next.id), next];
  return updateSharedSession(session, { payload: payload as unknown as Record<string, unknown> });
}

export async function updateCocScene(
  session: SharedSession,
  updates: {
    scene?: string;
    currentLocation?: string;
    investigator?: CocSessionPayload['investigator'];
    musicCue?: CocSessionPayload['musicCue'];
  },
): Promise<SharedSession> {
  const payload = { ...payloadOf(session), ...updates };
  return updateSharedSession(session, { payload: payload as unknown as Record<string, unknown> });
}

export async function finishCocSession(session: SharedSession): Promise<SharedSession> {
  const payload = {
    ...payloadOf(session),
    finishedAt: Date.now(),
  };
  return updateSharedSession(session, { status: 'completed', payload });
}
