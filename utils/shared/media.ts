import { sharedRequestBlob, sharedUploadBlob } from './sharedClient';
import { mutateSharedOrQueue } from './syncQueue';

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function uploadSharedMedia(
  blob: Blob,
  prefix = 'media',
  preferredId?: string,
): Promise<string | null> {
  const id = preferredId || makeId(prefix);
  const ok = await sharedUploadBlob(`/v1/media/${encodeURIComponent(id)}`, blob);
  return ok ? id : null;
}

export async function downloadSharedMedia(id: string): Promise<Blob | null> {
  return sharedRequestBlob(`/v1/media/${encodeURIComponent(id)}`);
}

export async function deleteSharedMedia(id: string): Promise<boolean> {
  return mutateSharedOrQueue(`/v1/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
