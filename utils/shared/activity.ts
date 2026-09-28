import { resolveSharedActor } from './identity';
import { mutateSharedOrQueue } from './syncQueue';
import type { SharedActivity } from './types';

const LOCAL_ACTIVITY_KEY = 'shared_phone_activity_buffer_v1';
const MAX_LOCAL_ACTIVITY = 100;

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function saveLocalActivity(activity: SharedActivity): void {
  try {
    const current = JSON.parse(localStorage.getItem(LOCAL_ACTIVITY_KEY) || '[]') as SharedActivity[];
    current.push(activity);
    localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(current.slice(-MAX_LOCAL_ACTIVITY)));
  } catch {
    // Activity logging must never break an app action.
  }
}

export function getBufferedSharedActivities(): SharedActivity[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ACTIVITY_KEY) || '[]') as SharedActivity[];
  } catch {
    return [];
  }
}

export async function recordSharedActivity(
  action: string,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const activity: SharedActivity = {
    id: makeId(),
    actor: resolveSharedActor(),
    action,
    targetType,
    targetId,
    metadata,
    createdAt: Date.now(),
  };

  saveLocalActivity(activity);
  await mutateSharedOrQueue('/v1/activity', {
    method: 'POST',
    body: JSON.stringify(activity),
    timeoutMs: 3000,
  });
}
