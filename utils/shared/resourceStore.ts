import { resolveSharedActor } from './identity';
import { sharedRequest } from './sharedClient';
import { mutateSharedOrQueue } from './syncQueue';

export type SharedResourceKind = 'social_post' | 'room_note' | 'anniversary' | 'free_activity';

export interface SharedResourceRecord<T> {
  id: string;
  kind: SharedResourceKind | 'gallery';
  scope: string;
  payload: T | null;
  updatedBy: 'xiaoci' | 'laoshi';
  updatedAt: number;
  deleted?: boolean;
  mediaId?: string;
}

interface ResourceListResponse<T> {
  items: SharedResourceRecord<T>[];
}

const VERSION_KEY = 'shared_phone_resource_versions_v1';

type LocalVersionMap = Record<string, number>;

function readVersions(): LocalVersionMap {
  try {
    return JSON.parse(localStorage.getItem(VERSION_KEY) || '{}') as LocalVersionMap;
  } catch {
    return {};
  }
}

function writeVersions(value: LocalVersionMap): void {
  try { localStorage.setItem(VERSION_KEY, JSON.stringify(value)); } catch {}
}

function versionKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

export function getLocalResourceVersion(kind: string, id: string): number {
  return readVersions()[versionKey(kind, id)] || 0;
}

export function markLocalResourceVersion(kind: string, id: string, updatedAt = Date.now()): number {
  const versions = readVersions();
  versions[versionKey(kind, id)] = updatedAt;
  writeVersions(versions);
  return updatedAt;
}

export async function listSharedResources<T>(
  kind: SharedResourceKind | 'gallery',
  scope = '',
): Promise<SharedResourceRecord<T>[]> {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  const result = await sharedRequest<ResourceListResponse<T>>(`/v1/resources/${kind}${query}`, { method: 'GET' });
  return result?.items || [];
}

export async function putSharedResource<T>(
  kind: SharedResourceKind | 'gallery',
  id: string,
  payload: T,
  scope = '',
  extra: { mediaId?: string; updatedAt?: number } = {},
): Promise<void> {
  const updatedAt = extra.updatedAt || markLocalResourceVersion(kind, id);
  await mutateSharedOrQueue(`/v1/resources/${kind}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      id,
      kind,
      scope,
      payload,
      updatedBy: resolveSharedActor(),
      updatedAt,
      mediaId: extra.mediaId,
    }),
  });
}

export async function deleteSharedResource(
  kind: SharedResourceKind | 'gallery',
  id: string,
  scope = '',
): Promise<void> {
  const updatedAt = markLocalResourceVersion(kind, id);
  await mutateSharedOrQueue(`/v1/resources/${kind}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      scope,
      updatedBy: resolveSharedActor(),
      updatedAt,
    }),
  });
}

export function mergeSharedResourceRecords<T extends { id: string }>(
  kind: SharedResourceKind,
  local: T[],
  remote: SharedResourceRecord<T>[],
): T[] {
  const byId = new Map(local.map(item => [item.id, item]));

  for (const record of remote) {
    const localVersion = getLocalResourceVersion(kind, record.id);
    if (record.updatedAt < localVersion) continue;

    markLocalResourceVersion(kind, record.id, record.updatedAt);
    if (record.deleted || !record.payload) byId.delete(record.id);
    else byId.set(record.id, record.payload);
  }

  return [...byId.values()];
}
