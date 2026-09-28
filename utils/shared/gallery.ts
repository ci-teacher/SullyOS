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

const PENDING_GALLERY_KEY = 'shared_phone_pending_gallery_media_v1';
let galleryRetryInstalled = false;
let galleryRetryTimer: number | null = null;

function readPendingGallery(): GalleryImage[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_GALLERY_KEY) || '[]') as GalleryImage[];
  } catch {
    return [];
  }
}

function writePendingGallery(items: GalleryImage[]): void {
  try {
    localStorage.setItem(PENDING_GALLERY_KEY, JSON.stringify(items.slice(-100)));
  } catch {
    // Media retry metadata must never block the local gallery save.
  }
}

function queuePendingGallery(image: GalleryImage): void {
  const items = readPendingGallery().filter(item => item.id !== image.id);
  items.push(image);
  writePendingGallery(items);
}

function removePendingGallery(id: string): void {
  writePendingGallery(readPendingGallery().filter(item => item.id !== id));
}

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
      removePendingGallery(record.id);
      continue;
    }

    const image = await materializeRemoteImage(record, byId);
    if (image) out.set(image.id, image);
  }

  return [...out.values()];
}

async function uploadGalleryImage(image: GalleryImage): Promise<boolean> {
  const updatedAt = getLocalResourceVersion('gallery', image.id) || markLocalResourceVersion('gallery', image.id);
  let mediaId: string | undefined;
  const blob = await imageBlob(image.url);

  if (blob) {
    mediaId = `gallery-${image.id}`;
    const uploaded = await sharedUploadBlob(`/v1/media/${encodeURIComponent(mediaId)}`, blob);
    if (!uploaded) return false;
  }

  await putSharedResource('gallery', image.id, image, image.charId, { mediaId, updatedAt });
  return true;
}

export async function saveSharedGalleryImage(image: GalleryImage): Promise<void> {
  markLocalResourceVersion('gallery', image.id);
  const ok = await uploadGalleryImage(image);
  if (ok) removePendingGallery(image.id);
  else queuePendingGallery(image);
}

export async function flushPendingSharedGallery(): Promise<void> {
  const pending = readPendingGallery();
  if (!pending.length) return;

  const remaining: GalleryImage[] = [];
  for (const image of pending) {
    const ok = await uploadGalleryImage(image);
    if (!ok) remaining.push(image);
  }
  writePendingGallery(remaining);
}

const galleryRetryListener = () => { void flushPendingSharedGallery(); };

export function installSharedGalleryRetry(): void {
  if (galleryRetryInstalled || typeof window === 'undefined') return;
  galleryRetryInstalled = true;
  window.addEventListener('online', galleryRetryListener);
  window.addEventListener('focus', galleryRetryListener);
  galleryRetryTimer = window.setInterval(galleryRetryListener, 2 * 60_000);
  galleryRetryListener();
}

export function uninstallSharedGalleryRetry(): void {
  if (!galleryRetryInstalled || typeof window === 'undefined') return;
  galleryRetryInstalled = false;
  window.removeEventListener('online', galleryRetryListener);
  window.removeEventListener('focus', galleryRetryListener);
  if (galleryRetryTimer !== null) window.clearInterval(galleryRetryTimer);
  galleryRetryTimer = null;
}

export async function deleteSharedGalleryImage(imageId: string, charId = ''): Promise<void> {
  removePendingGallery(imageId);
  await deleteSharedResource('gallery', imageId, charId);
}
