import { resolveSharedActor, type SharedActor } from './identity';
import { sharedRequest } from './sharedClient';
import { mutateSharedOrQueue } from './syncQueue';
import { recordSharedActivity } from './activity';
import type {
  SharedEntry,
  SharedEntryType,
  SharedEvent,
  SharedListResponse,
  SharedSession,
  SharedSessionKind,
  SharedSessionStatus,
  SharedVisibility,
} from './types';

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function encodeQuery(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function listSharedEntries(options: {
  appType?: SharedEntryType;
  visibility?: SharedVisibility;
  limit?: number;
} = {}): Promise<SharedEntry[]> {
  const query = encodeQuery(options);
  const result = await sharedRequest<SharedListResponse<SharedEntry>>(`/v1/entries${query}`, { method: 'GET' });
  return result?.items || [];
}

export async function saveSharedEntry(entry: SharedEntry): Promise<boolean> {
  const ok = await mutateSharedOrQueue(`/v1/entries/${encodeURIComponent(entry.id)}`, {
    method: 'PUT',
    body: JSON.stringify(entry),
  });

  void recordSharedActivity(
    `${entry.appType}.save`,
    'entry',
    entry.id,
    { appType: entry.appType, visibility: entry.visibility },
  );
  return ok;
}

export async function createSharedEntry(input: {
  appType: SharedEntryType;
  title?: string;
  body?: string;
  payload?: Record<string, unknown>;
  visibility?: SharedVisibility;
  author?: SharedActor;
}): Promise<SharedEntry> {
  const now = Date.now();
  const entry: SharedEntry = {
    id: makeId(input.appType),
    author: input.author || resolveSharedActor(),
    appType: input.appType,
    title: input.title,
    body: input.body || '',
    payload: input.payload,
    visibility: input.visibility || 'shared',
    createdAt: now,
    updatedAt: now,
  };
  await saveSharedEntry(entry);
  return entry;
}

export async function deleteSharedEntry(id: string, appType: SharedEntryType): Promise<void> {
  await mutateSharedOrQueue(`/v1/entries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ updatedBy: resolveSharedActor(), updatedAt: Date.now() }),
  });
  void recordSharedActivity(`${appType}.delete`, 'entry', id, { appType });
}

export async function sendSharedLetter(input: {
  title?: string;
  body: string;
  to?: SharedActor;
}): Promise<SharedEntry> {
  return createSharedEntry({
    appType: 'letter',
    title: input.title,
    body: input.body,
    payload: input.to ? { to: input.to } : undefined,
    visibility: 'shared',
  });
}

export async function saveSharedMemory(input: {
  title?: string;
  body: string;
  tags?: string[];
  happenedAt?: number;
}): Promise<SharedEntry> {
  return createSharedEntry({
    appType: 'memory',
    title: input.title,
    body: input.body,
    payload: {
      tags: input.tags || [],
      happenedAt: input.happenedAt,
    },
  });
}

export async function saveSharedCalendarItem(input: {
  title: string;
  body?: string;
  startsAt: number;
  endsAt?: number;
  allDay?: boolean;
  recurrence?: string;
}): Promise<SharedEntry> {
  return createSharedEntry({
    appType: 'calendar',
    title: input.title,
    body: input.body || '',
    payload: {
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: Boolean(input.allDay),
      recurrence: input.recurrence,
    },
  });
}

export async function listSharedEvents(options: {
  type?: string;
  source?: string;
  pending?: boolean;
  limit?: number;
} = {}): Promise<SharedEvent[]> {
  const query = encodeQuery({
    type: options.type,
    source: options.source,
    pending: options.pending ? 1 : undefined,
    limit: options.limit,
  });
  const result = await sharedRequest<SharedListResponse<SharedEvent>>(`/v1/events${query}`, { method: 'GET' });
  return result?.items || [];
}

export async function emitSharedEvent(input: {
  type: string;
  source: string;
  payload?: Record<string, unknown>;
  expiresAt?: number;
}): Promise<SharedEvent> {
  const event: SharedEvent = {
    id: makeId('event'),
    type: input.type,
    source: input.source,
    payload: input.payload,
    createdAt: Date.now(),
    expiresAt: input.expiresAt,
  };
  await mutateSharedOrQueue('/v1/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });
  return event;
}

export async function consumeSharedEvent(id: string): Promise<void> {
  await mutateSharedOrQueue(`/v1/events/${encodeURIComponent(id)}/consume`, {
    method: 'POST',
    body: JSON.stringify({ consumedAt: Date.now() }),
  });
}

export async function listSharedSessions(options: {
  kind?: SharedSessionKind;
  status?: SharedSessionStatus;
  limit?: number;
} = {}): Promise<SharedSession[]> {
  const query = encodeQuery(options);
  const result = await sharedRequest<SharedListResponse<SharedSession>>(`/v1/sessions${query}`, { method: 'GET' });
  return result?.items || [];
}

export async function saveSharedSession(session: SharedSession): Promise<boolean> {
  const ok = await mutateSharedOrQueue(`/v1/sessions/${encodeURIComponent(session.id)}`, {
    method: 'PUT',
    body: JSON.stringify(session),
  });

  void recordSharedActivity(
    `${session.kind}.session.save`,
    'session',
    session.id,
    { kind: session.kind, status: session.status },
  );
  return ok;
}

export async function createSharedSession(input: {
  kind: SharedSessionKind;
  title?: string;
  status?: SharedSessionStatus;
  payload?: Record<string, unknown>;
}): Promise<SharedSession> {
  const now = Date.now();
  const session: SharedSession = {
    id: makeId(input.kind),
    kind: input.kind,
    title: input.title,
    status: input.status || 'active',
    payload: input.payload || {},
    updatedBy: resolveSharedActor(),
    createdAt: now,
    updatedAt: now,
  };
  await saveSharedSession(session);
  return session;
}

export async function updateSharedSession(
  session: SharedSession,
  updates: Partial<Pick<SharedSession, 'title' | 'status' | 'payload'>>,
): Promise<SharedSession> {
  const next: SharedSession = {
    ...session,
    ...updates,
    updatedBy: resolveSharedActor(),
    updatedAt: Date.now(),
  };
  await saveSharedSession(next);
  return next;
}

export async function deleteSharedSession(id: string, kind: SharedSessionKind): Promise<void> {
  await mutateSharedOrQueue(`/v1/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ updatedBy: resolveSharedActor(), updatedAt: Date.now() }),
  });
  void recordSharedActivity(`${kind}.session.delete`, 'session', id, { kind });
}
