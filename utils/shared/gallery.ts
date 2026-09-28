import type { GalleryImage } from '../../types';
import { dataUrlToBlob, getBlobForRef, isBlobRef, putImageBlob } from '../blobRef';
import { sharedRequestBlob, sharedUploadBlob } from './sharedClient';
import {
  deleteSharedResource,
  getLocalResourceVersion,
  listSharedResources,
  markLocalResourceVersion,
  putSharedResource,
  type SharedResourceRecord,
} from './resourceStore';

async function imageBlob(url: string): Promise<Blob | null> {
  if (isBlobRef(url)) return await getBlobForRef(url);
  if (url.startsWith('data:')) {
    try { return dataUrlToBlob(url); } catch { return null; }
  }
  return null;
}

async function materializeRemoteImage(
  record: SharedResourceRecord<GalleryImage>,
  localById: Map<string, GalleryImage>,
): Promise<GalleryImage | null> {
  if (record.deleted || !record.payload) return null;

  const local = localById.get(record.id);
  const localVersion = getLocalResourceVersion('gallery', record.id);
  if (local && localVersion >= record.updatedAt) return local;

  let image = record.payload;
  if (record.mediaId) {
    const blob = await sharedRequestBlob(`/v1/media/${encodeURIComponent(record.mediaId)}`);
    if (blob) {
      const token = await putImageBlob(blob);
      image = { ...image, url: token };
    } else if (!local) {
      return null;
    }
  }

  markLocalResourceVersion('gallery', record.id, record.updatedAt);
  return image;
}

export async function fetchSharedGallery(
  local: GalleryImage[],
  charId?: string,
): Promise<GalleryImage[]> {
  const records = await listSharedResources<GalleryImage>('gallery', charId || '');
  const byId = new Map(local.map(item => [item.id, item]));
  const out = new Map(byId);

  for (const record of records) {
    const localVersion = getLocalResourceVersion('gallery', record.id);
    if (record.updatedAt < localVersion) continue;

    if (record.deleted) {
      out.delete(record.id);
      markLocalResourceVersion('gallery', record.id, record.updatedAt);
      continue;
    }

    const image = await materializeRemoteImage(record, byId);
    if (image) out.set(image.id, image);
  }

  return [...out.values()];
}

export async function saveSharedGalleryImage(image: GalleryImage): Promise<void> {
  const updatedAt = markLocalResourceVersion('gallery', image.id);
  let mediaId: string | undefined;
  const blob = await imageBlob(image.url);

  if (blob) {
    mediaId = `gallery-${image.id}`;
    const uploaded = await sharedUploadBlob(`/v1/media/${encodeURIComponent(mediaId)}`, blob);
    if (!uploaded) mediaId = undefined;
  }

  await putSharedResource('gallery', image.id, image, image.charId, { mediaId, updatedAt });
}

export async function deleteSharedGalleryImage(imageId: string, charId = ''): Promise<void> {
  await deleteSharedResource('gallery', imageId, charId);
}
